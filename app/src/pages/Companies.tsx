import { Building2, Handshake, PhoneCall, UserPlus } from 'lucide-react'
import { StatCard } from '@/components/analytics/dash'
import { useT } from '@/lib/i18n'
import { T } from '@/lib/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, FileUp, Plus, Search } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { CRM_WRITERS } from '@/lib/roles'
import { COMPANY_TYPE, download, fetchCompanies, fetchTeam, followUpState, LEAD_STATUS, PRIORITY, STATUS_TONE, toCSV, type Company, type TeamMember } from '@/lib/crm'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { CompanyForm } from '@/components/crm/CompanyForm'
import { ImportDialog } from '@/components/crm/ImportDialog'
import { cn } from '@/lib/utils'
import { usePersistentState } from '@/lib/usePersistentState'
import { MobileFilters } from '@/components/ui/mobile-filters'

const FOLLOW = { overdue: 'text-destructive font-medium', today: 'text-amber-700 dark:text-amber-300 font-medium', soon: 'text-foreground' }

export function Companies() {
  const { t: tl } = useT()
  const nav = useNavigate()
  const { hasRole } = useAuth()
  const canWrite = hasRole(...CRM_WRITERS)
  const [rows, setRows] = useState<Company[] | null>(null)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = usePersistentState('crm.filters', { q: '', status: '', country: '', owner: '', priority: '', follow: '', archived: false })
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const [params, setParams] = useSearchParams()
  useEffect(() => { if (params.get('new')) { setAddOpen(true); setParams({}, { replace: true }) } }, [params, setParams])
  const load = useCallback(() => Promise.all([fetchCompanies(), fetchTeam()]).then(([c, t]) => { setRows(c); setTeam(t) }).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const owner = useMemo(() => Object.fromEntries(team.map((t) => [t.id, t.name])), [team])
  const countries = useMemo(() => [...new Set((rows ?? []).map((r) => r.country).filter(Boolean) as string[])].sort(), [rows])
  const list = useMemo(() => {
    const t = f.q.trim().toLowerCase()
    return (rows ?? []).filter((r) => (f.archived ? !!r.archived_at : !r.archived_at)
      && (!f.status || r.lead_status === f.status) && (!f.country || r.country === f.country)
      && (!f.owner || (f.owner === 'none' ? !r.owner_id : r.owner_id === f.owner)) && (!f.priority || r.priority === f.priority)
      && (!f.follow || (f.follow === 'due' ? ['overdue', 'today'].includes(followUpState(r.next_follow_up_date) ?? '') : followUpState(r.next_follow_up_date) === 'soon'))
      && (!t || [r.name, r.country, r.city, r.email, r.phone, r.products_interested, r.website, ...r.tags].some((x) => (x ?? '').toLowerCase().includes(t))))
  }, [rows, f])
  const due = (rows ?? []).filter((r) => !r.archived_at && ['overdue', 'today'].includes(followUpState(r.next_follow_up_date) ?? '')).length

  function exportCSV() {
    download(`companies-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(list.map((r) => ({
      Company: r.name, Type: r.company_type ? COMPANY_TYPE[r.company_type] : '', Country: r.country, City: r.city, Website: r.website,
      Email: r.email, Phone: r.phone, WhatsApp: r.whatsapp, 'Products interested': r.products_interested, Status: LEAD_STATUS[r.lead_status],
      Priority: PRIORITY[r.priority], Owner: r.owner_id ? owner[r.owner_id] ?? '' : '', 'Last contact': r.last_contact_date, 'Next follow-up': r.next_follow_up_date,
      Source: r.lead_source, Tags: r.tags, Notes: r.notes,
    }))))
  }

  return (
    <>
      <PageHeader title="CRM & Importers" summary={rows ? tl('{n} companies · {m} follow-ups due today or overdue', { n: rows.filter((r) => !r.archived_at).length, m: due }) : 'Customers, importers and leads'}
        action={<div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={!list.length}><Download />Export</Button>
          {canWrite && <Button variant="outline" onClick={() => setImportOpen(true)}><FileUp />Import</Button>}
          {canWrite && <Button onClick={() => setAddOpen(true)}><Plus />Add company</Button>}
        </div>} />
      {rows && rows.length > 0 && (() => {
        const live = rows.filter((r) => !r.archived_at)
        const month = new Date().toISOString().slice(0, 7)
        return (
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Building2} tone="blue" label="Companies" value={live.length} foot="In the CRM" />
            <StatCard icon={Handshake} tone="emerald" label="Active customers" value={live.filter((r) => r.lead_status === 'active_customer').length} foot="Buying from us" />
            <StatCard icon={PhoneCall} tone="rose" label="Follow-ups due" value={due} foot="Today or overdue" />
            <StatCard icon={UserPlus} tone="violet" label="New this month" value={live.filter((r) => r.created_at.slice(0, 7) === month).length} foot="Added to the CRM" />
          </div>
        )
      })()}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-8" placeholder="Search name, country, email, product, tag…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
        <MobileFilters active={[f.status, f.country, f.owner, f.priority, f.follow].filter(Boolean).length + (f.archived ? 1 : 0)}>
        <div className="w-full sm:w-40"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status"><option value="">All statuses</option>{Object.entries(LEAD_STATUS).map(([k, l]) => <option key={k} value={k}><T>{l}</T></option>)}</Select></div>
        <div className="w-full sm:w-36"><Select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} aria-label="Country"><option value="">All countries</option>{countries.map((c) => <option key={c}>{c}</option>)}</Select></div>
        {team.length > 1 && <div className="w-full sm:w-40"><Select value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} aria-label="Owner"><option value="">All owners</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="none">Unassigned</option></Select></div>}
        <div className="w-full sm:w-32"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} aria-label="Priority"><option value="">Any priority</option>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}><T>{l}</T></option>)}</Select></div>
        <div className="w-full sm:w-40"><Select value={f.follow} onChange={(e) => setF({ ...f, follow: e.target.value })} aria-label="Follow-up"><option value="">Any follow-up</option><option value="due">Due / overdue</option><option value="soon">Next 7 days</option></Select></div>
        <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground"><input type="checkbox" className="size-4 accent-[#23856B]" checked={f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked })} />Archived</label>
        </MobileFilters>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {error ? <div className="p-5"><ErrorState message={error} /></div> : !rows ? <Loading /> : !list.length ? (
            <div className="p-5"><Empty title={rows.length ? 'No companies match' : 'No companies yet'} hint={rows.length ? 'No company fits these filters.' : 'Add your first importer, or bring your list from Excel.'}
              action={rows.length
                ? <Button variant="outline" onClick={() => setF({ q: '', status: '', country: '', owner: '', priority: '', follow: '', archived: false })}>Clear filters</Button>
                : canWrite && <><Button onClick={() => setAddOpen(true)}><Plus />Add company</Button><Button variant="outline" onClick={() => setImportOpen(true)}><FileUp />Import Excel / CSV</Button></>} /></div>
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium"><T>Company</T></th><th className="px-3 py-3 font-medium"><T>Country</T></th><th className="px-3 py-3 font-medium"><T>Interested in</T></th>
                <th className="px-3 py-3 font-medium"><T>Status</T></th><th className="px-3 py-3 font-medium"><T>Owner</T></th><th className="px-3 py-3 font-medium"><T>Next follow-up</T></th>
              </tr></thead>
              <tbody>
                {list.map((r) => {
                  const fu = followUpState(r.next_follow_up_date)
                  return (
                    <tr key={r.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50" onClick={() => nav(`/crm/${r.id}`)}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 font-medium">{r.name}{r.priority === 'high' && <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">HIGH</span>}</div>
                        <div className="text-xs text-muted-foreground">{[r.company_type && COMPANY_TYPE[r.company_type], r.email].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{[r.city, r.country].filter(Boolean).join(', ') || '—'}</td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-muted-foreground">{r.products_interested || '—'}</td>
                      <td className="px-3 py-3"><span className={cn('whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_TONE[r.lead_status])}><T>{LEAD_STATUS[r.lead_status]}</T></span></td>
                      <td className="px-3 py-3 text-muted-foreground">{r.owner_id ? owner[r.owner_id] ?? '—' : 'Unassigned'}</td>
                      <td className={cn('px-3 py-3 text-muted-foreground', fu && FOLLOW[fu])}>{r.next_follow_up_date ?? '—'}{fu === 'overdue' && ' · overdue'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <CompanyForm open={addOpen} onOpenChange={setAddOpen} company={null} team={team} onSaved={(id) => nav(`/crm/${id}`)} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={load} />
    </>
  )
}
