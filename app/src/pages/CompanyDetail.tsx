import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ArrowLeft, FileText, Globe, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { CRM_ASSIGNERS, CRM_WRITERS, QUOTE_WRITERS } from '@/lib/roles'
import {
  ACTIVITY_KIND, COMPANY_TYPE, CONTACT_METHOD, fetchCompanyDetail, fetchTeam, followUpState, LEAD_STATUS, PRIORITY, STATUS_TONE,
  type Activity, type Company, type Contact, type TeamMember,
} from '@/lib/crm'
import { fmtDateDMY, STATUS_LABEL as Q_LABEL, STATUS_STYLE as Q_STYLE, type QuoteStatus } from '@/lib/quotations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { CompanyForm } from '@/components/crm/CompanyForm'
import { OpportunityDialog } from '@/components/sales/OpportunityDialog'
import { TaskDialog } from '@/components/sales/TaskDialog'
import { fetchCatalog, type Product } from '@/lib/catalog'
import { fetchStages, taskBucket, TASK_STATUS, type Opportunity, type Stage, type Task } from '@/lib/sales'
import { money } from '@/lib/prices'
import { cn } from '@/lib/utils'

type Detail = Awaited<ReturnType<typeof fetchCompanyDetail>>

export function CompanyDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { hasRole, session } = useAuth()
  const [d, setD] = useState<Detail | null>(null)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'timeline' | 'deals' | 'contacts' | 'profile' | 'quotes'>('timeline')
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(() => Promise.all([fetchCompanyDetail(id!), fetchTeam()]).then(([x, t]) => { setD(x); setTeam(t) }).catch((e) => setError(e.message)), [id])
  useEffect(() => { load() }, [load])

  const owner = useMemo(() => Object.fromEntries(team.map((t) => [t.id, t.name])), [team])
  if (error) return <ErrorState message={error.includes('0 rows') ? 'Company not found, or it belongs to another sales person.' : error} />
  if (!d) return <Loading />
  const c = d.company
  const canEdit = hasRole(...CRM_WRITERS) && (c.owner_id === session?.user.id || hasRole(...CRM_ASSIGNERS))
  const fu = followUpState(c.next_follow_up_date)

  async function patch(p: Partial<Company>, msg: string) {
    const { error, data } = await supabase.from('companies').update(p).eq('id', c.id).select('id')
    if (error || !data?.length) return toast.error(error?.message ?? 'Not allowed.')
    toast.success(msg); load()
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav('/crm')} aria-label="Back"><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {c.name}
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_TONE[c.lead_status])}>{LEAD_STATUS[c.lead_status]}</span>
            {c.archived_at && <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Archived</span>}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[c.company_type && COMPANY_TYPE[c.company_type], [c.city, c.country].filter(Boolean).join(', '), `Owner: ${c.owner_id ? owner[c.owner_id] ?? '—' : 'Unassigned'}`, `${PRIORITY[c.priority]} priority`].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {c.email && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`mailto:${c.email}`}><Mail className="size-3.5" />{c.email}</a>}
            {c.phone && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${c.phone}`}><Phone className="size-3.5" />{c.phone}</a>}
            {c.whatsapp && <a className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`}><MessageCircle className="size-3.5" />WhatsApp</a>}
            {c.website && <a className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noreferrer" href={/^https?:\/\//.test(c.website) ? c.website : `https://${c.website}`}><Globe className="size-3.5" />Website</a>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasRole(...QUOTE_WRITERS) && canEdit && <Button variant="outline" onClick={() => nav(`/quotations/new?company=${c.id}`)}><FileText />New quotation</Button>}
          {canEdit && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil />Edit</Button>}
          {canEdit && <Button variant="ghost" size="icon" title={c.archived_at ? 'Restore' : 'Archive'} aria-label={c.archived_at ? 'Restore' : 'Archive'}
            onClick={() => (c.archived_at || window.confirm(`Archive ${c.name}? You can restore it later.`)) && patch({ archived_at: c.archived_at ? null : new Date().toISOString() } as Partial<Company>, c.archived_at ? 'Restored' : 'Archived')}>
            {c.archived_at ? <ArchiveRestore /> : <Archive />}</Button>}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Status</div>
          <Select className="mt-1" value={c.lead_status} disabled={!canEdit} onChange={async (e) => {
            const v = e.target.value as Company['lead_status']
            await patch({ lead_status: v }, 'Status updated')
            await supabase.from('activities').insert({ company_id: c.id, kind: 'status', summary: `Status changed from ${LEAD_STATUS[c.lead_status]} to ${LEAD_STATUS[v]}`, created_by: session?.user.id })
            load()
          }}>{Object.entries(LEAD_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Next follow-up</div>
          <Input type="date" className={cn('mt-1', fu === 'overdue' && 'border-destructive text-destructive')} value={c.next_follow_up_date ?? ''} disabled={!canEdit}
            onChange={(e) => patch({ next_follow_up_date: e.target.value || null }, 'Follow-up date saved')} />
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Last contact</div>
          <div className="mt-2 text-sm font-medium">{c.last_contact_date ? fmtDateDMY(c.last_contact_date) : '—'}</div>
        </CardContent></Card>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border">
        {([['timeline', `Timeline (${d.activities.length})`], ['deals', 'Deals & tasks'], ['contacts', `Contacts (${d.contacts.length})`], ['profile', 'Profile'], ['quotes', `Quotations (${d.quotations.length})`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === k ? 'border-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>

      {tab === 'timeline' && <Timeline company={c} activities={d.activities} canEdit={canEdit} owner={owner} onChange={load} />}
      {tab === 'deals' && <DealsAndTasks company={c} team={team} canEdit={canEdit} />}
      {tab === 'contacts' && <Contacts companyId={c.id} contacts={d.contacts} canEdit={canEdit} onChange={load} />}
      {tab === 'profile' && <Profile c={c} />}
      {tab === 'quotes' && (
        <Card><CardContent className="p-0">
          {!d.quotations.length ? <div className="p-5"><Empty title="No quotations for this company yet" /></div> : (
            <ul className="divide-y divide-border">
              {d.quotations.map((q) => (
                <li key={q.id}><Link to={`/quotations/${q.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-accent/50">
                  <span className="font-medium">{q.number}{q.version > 1 ? ` rev. ${q.version}` : ''} <span className="font-normal text-muted-foreground">· {fmtDateDMY(q.issue_date)} · {q.incoterm ?? ''} {q.currency}</span></span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-xs', Q_STYLE[q.status as QuoteStatus])}>{Q_LABEL[q.status as QuoteStatus]}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      )}

      <CompanyForm open={editOpen} onOpenChange={setEditOpen} company={c} team={team} onSaved={() => load()} />
    </>
  )
}

function Timeline({ company, activities, canEdit, owner, onChange }: { company: Company; activities: Activity[]; canEdit: boolean; owner: Record<string, string>; onChange: () => void }) {
  const { session } = useAuth()
  const [kind, setKind] = useState<Activity['kind']>('call')
  const [text, setText] = useState('')
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 16))
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return toast.error('Write what happened.')
    setBusy(true)
    const { error } = await supabase.from('activities').insert({ company_id: company.id, kind, summary: text.trim(), happened_at: new Date(when).toISOString(), created_by: session?.user.id })
    if (!error && ['call', 'email', 'whatsapp', 'meeting'].includes(kind)) {
      const p: Record<string, string> = { last_contact_date: when.slice(0, 10) }
      if (next) p.next_follow_up_date = next
      await supabase.from('companies').update(p).eq('id', company.id)
    }
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Added to timeline'); setText(''); setNext(''); onChange()
  }
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {canEdit && (
        <Card className="h-fit lg:col-span-2">
          <CardHeader><CardTitle>Log activity</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={add} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value as Activity['kind'])}>{Object.entries(ACTIVITY_KIND).filter(([k]) => k !== 'status').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                <Field label="When"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
              </div>
              <Field label="What happened"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Sent price list, asked for samples of IQF mango" /></Field>
              <Field label="Next follow-up (optional)"><Input type="date" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}Add</Button>
              <p className="text-xs text-muted-foreground">Entries cannot be edited or deleted later.</p>
            </form>
          </CardContent>
        </Card>
      )}
      <Card className={canEdit ? 'lg:col-span-3' : 'lg:col-span-5'}>
        <CardContent className="pt-5">
          {!activities.length ? <Empty title="Nothing logged yet" /> : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {activities.map((a) => (
                <li key={a.id}>
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary" />
                  <div className="text-xs text-muted-foreground">{ACTIVITY_KIND[a.kind]} · {new Date(a.happened_at).toLocaleString()} · {a.created_by ? owner[a.created_by] ?? 'Employee' : 'System'}</div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{a.summary}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Contacts({ companyId, contacts, canEdit, onChange }: { companyId: string; contacts: Contact[]; canEdit: boolean; onChange: () => void }) {
  const blank = { id: '', name: '', job_title: '', email: '', phone: '', whatsapp: '', linkedin: '', notes: '' }
  const [f, setF] = useState<typeof blank | null>(null)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f) return
    if (!f.name.trim()) return toast.error('Name is required')
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return toast.error('Email is not valid')
    const row = Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'id').map(([k, v]) => [k, v.trim() || null]))
    const { error } = f.id ? await supabase.from('company_contacts').update(row).eq('id', f.id) : await supabase.from('company_contacts').insert({ ...row, company_id: companyId, is_primary: !contacts.length })
    if (error) return toast.error(error.message)
    toast.success('Contact saved'); setF(null); onChange()
  }
  async function makePrimary(id: string) {
    await supabase.from('company_contacts').update({ is_primary: false }).eq('company_id', companyId)
    const { error } = await supabase.from('company_contacts').update({ is_primary: true }).eq('id', id)
    if (error) toast.error(error.message); onChange()
  }
  async function remove(c: Contact) {
    if (!window.confirm(`Remove ${c.name}?`)) return
    const { error } = await supabase.from('company_contacts').delete().eq('id', c.id)
    if (error) toast.error(error.message); onChange()
  }
  return (
    <div className="space-y-3">
      {canEdit && !f && <Button variant="outline" onClick={() => setF(blank)}><Plus />Add contact</Button>}
      {f && (
        <Card><CardContent className="pt-5">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
            {(['name', 'job_title', 'email', 'phone', 'whatsapp', 'linkedin'] as const).map((k) => (
              <Field key={k} label={{ name: 'Name *', job_title: 'Job title', email: 'Email', phone: 'Phone', whatsapp: 'WhatsApp', linkedin: 'LinkedIn' }[k]}>
                <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              </Field>
            ))}
            <Field label="Notes" className="sm:col-span-3"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <div className="flex gap-2 sm:col-span-3"><Button type="submit">Save</Button><Button type="button" variant="ghost" onClick={() => setF(null)}>Cancel</Button></div>
          </form>
        </CardContent></Card>
      )}
      {!contacts.length && !f ? <Empty title="No contacts yet" /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <Card key={c.id}><CardContent className="space-y-1 pt-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div><div className="font-medium">{c.name} {c.is_primary && <span className="ml-1 text-xs text-amber-600">★ primary</span>}</div><div className="text-xs text-muted-foreground">{c.job_title}</div></div>
                {canEdit && <div className="flex">
                  {!c.is_primary && <Button variant="ghost" size="icon" title="Make primary" aria-label="Make primary" onClick={() => makePrimary(c.id)}><Star /></Button>}
                  <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setF({ id: c.id, name: c.name, job_title: c.job_title ?? '', email: c.email ?? '', phone: c.phone ?? '', whatsapp: c.whatsapp ?? '', linkedin: c.linkedin ?? '', notes: c.notes ?? '' })}><Pencil /></Button>
                  <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => remove(c)}><Trash2 /></Button>
                </div>}
              </div>
              {c.email && <div><a className="text-primary hover:underline" href={`mailto:${c.email}`}>{c.email}</a></div>}
              {c.phone && <div>{c.phone}</div>}
              {c.whatsapp && <div><a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`}>WhatsApp {c.whatsapp}</a></div>}
              {c.notes && <div className="text-xs text-muted-foreground">{c.notes}</div>}
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Profile({ c }: { c: Company }) {
  const rows: [string, string | null | undefined][] = [
    ['Address', c.address], ['Business description', c.business_description], ['LinkedIn', c.linkedin],
    ['Preferred contact', c.preferred_contact && CONTACT_METHOD[c.preferred_contact]], ['Products interested in', c.products_interested],
    ['Product category', c.product_category], ['Current supplier', [c.current_supplier, c.current_supplier_country].filter(Boolean).join(' — ')],
    ['Estimated monthly volume', c.estimated_volume], ['Packaging requirements', c.packaging_requirements], ['Target market', c.target_market],
    ['Preferred Incoterm', c.preferred_incoterm], ['Preferred payment terms', c.preferred_payment_terms], ['Lead source', c.lead_source],
    ['Tags', c.tags.join(', ')], ['Internal notes', c.notes], ['Created', new Date(c.created_at).toLocaleDateString()],
  ]
  return (
    <Card><CardContent className="pt-5">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap text-sm">{v || '—'}</dd></div>)}
      </dl>
    </CardContent></Card>
  )
}

function DealsAndTasks({ company, team, canEdit }: { company: Company; team: TeamMember[]; canEdit: boolean }) {
  const [x, setX] = useState<{ stages: Stage[]; opps: Opportunity[]; tasks: Task[]; products: Product[] } | null>(null)
  const [oppOpen, setOppOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [opp, setOpp] = useState<Opportunity | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const load = useCallback(async () => {
    const [stages, o, t, cat] = await Promise.all([fetchStages(),
      supabase.from('opportunities').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('company_id', company.id).order('due_date'), fetchCatalog()])
    setX({ stages, opps: (o.data ?? []) as Opportunity[], tasks: (t.data ?? []) as Task[], products: cat.products })
  }, [company.id])
  useEffect(() => { load().catch((e) => toast.error(e.message)) }, [load])
  if (!x) return <Loading />
  const stage = Object.fromEntries(x.stages.map((s) => [s.id, s]))
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Deals</CardTitle>
          {canEdit && <Button variant="outline" size="sm" onClick={() => { setOpp(null); setOppOpen(true) }}><Plus />New deal</Button>}</CardHeader>
        <CardContent>
          {!x.opps.filter((o) => !o.archived_at).length ? <p className="text-sm text-muted-foreground">No deals yet.</p> : (
            <ul className="divide-y divide-border text-sm">
              {x.opps.filter((o) => !o.archived_at).map((o) => (
                <li key={o.id}><button className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-primary" onClick={() => { setOpp(o); setOppOpen(true) }}>
                  <span><span className="font-medium">{o.title}</span><span className="block text-xs text-muted-foreground">{stage[o.stage_id]?.name}{o.probability != null ? ` · ${o.probability}%` : ''}{o.expected_close_date ? ` · close ${o.expected_close_date}` : ''}</span></span>
                  <span className="tabular-nums">{o.expected_revenue != null ? money(o.expected_revenue, o.currency, 0) : ''}</span>
                </button></li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Tasks</CardTitle>
          <Button variant="outline" size="sm" onClick={() => { setTask(null); setTaskOpen(true) }}><Plus />New task</Button></CardHeader>
        <CardContent>
          {!x.tasks.length ? <p className="text-sm text-muted-foreground">No tasks yet.</p> : (
            <ul className="divide-y divide-border text-sm">
              {x.tasks.map((t) => (
                <li key={t.id}><button className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-primary" onClick={() => { setTask(t); setTaskOpen(true) }}>
                  <span className={cn(t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</span>
                  <span className={cn('text-xs text-muted-foreground', taskBucket(t, today) === 'overdue' && 'text-destructive')}>{t.status === 'done' ? TASK_STATUS.done : t.due_date ?? 'No date'}</span>
                </button></li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <OpportunityDialog open={oppOpen} onOpenChange={setOppOpen} opp={opp} stages={x.stages} companies={[company]} products={x.products} team={team} defaultCompanyId={company.id} onSaved={load} />
      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} task={task} companies={[company]} opportunities={x.opps} team={team} defaults={{ company_id: company.id }} onSaved={load} />
    </div>
  )
}
