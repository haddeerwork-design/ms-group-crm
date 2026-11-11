import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRightCircle, ExternalLink, Plus, Search, Star } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { PLAN_EDIT_ALL } from '@/lib/roles'
import { download, findDuplicates, toCSV } from '@/lib/crm'
import { PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { SimpleFormDialog, fromRow, toRow, type FieldSpec } from '@/components/ui/simple-form'
import { cn } from '@/lib/utils'
import { usePersistentState } from '@/lib/usePersistentState'

export const VERIFY = { unverified: 'Unverified lead', potential_buyer: 'Potential buyer', verified_importer: 'Verified importer' } as const
type Verify = keyof typeof VERIFY
const VERIFY_TONE: Record<Verify, string> = {
  unverified: 'border-border bg-muted text-muted-foreground',
  potential_buyer: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200',
  verified_importer: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
}
type Lead = {
  id: string; company_name: string; country: string | null; market: string | null; website: string | null; email: string | null; phone: string | null
  whatsapp: string | null; linkedin: string | null; products_imported: string | null; product_origin: string | null; source_url: string | null
  research_date: string; verification_status: Verify; shortlisted: boolean; notes: string | null; researcher_id: string | null
  converted_company_id: string | null; archived_at: string | null; created_at: string
}
const KEYS = ['company_name', 'country', 'market', 'website', 'email', 'phone', 'whatsapp', 'linkedin', 'products_imported', 'product_origin', 'source_url', 'research_date', 'verification_status', 'notes']
const FIELDS: FieldSpec[] = [
  { key: 'company_name', label: 'Company name', required: true, span: 2 }, { key: 'country', label: 'Country' },
  { key: 'market', label: 'Market / region', placeholder: 'e.g. GCC, EU' }, { key: 'products_imported', label: 'Products they import', span: 2 },
  { key: 'product_origin', label: 'They import from (origin)', placeholder: 'e.g. Spain, South Africa' }, { key: 'website', label: 'Website' }, { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'linkedin', label: 'LinkedIn' },
  { key: 'source_url', label: 'Source link (evidence)', span: 2, placeholder: 'https://…', hint: 'Where you found that they import. Required for “Verified importer”.' },
  { key: 'research_date', label: 'Research date', type: 'date' },
  { key: 'verification_status', label: 'Verification', type: 'select', options: Object.entries(VERIFY).map(([value, label]) => ({ value, label })) },
  { key: 'notes', label: 'Notes', type: 'textarea', span: 3 },
]

export function MarketResearch() {
  const { session, hasRole } = useAuth()
  const nav = useNavigate()
  const me = session?.user.id
  const editAll = hasRole(...PLAN_EDIT_ALL)
  const [rows, setRows] = useState<Lead[] | null>(null)
  const [team, setTeam] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = usePersistentState('research.q', '')
  const [country, setCountry] = usePersistentState('research.country', '')
  const [status, setStatus] = usePersistentState('research.status', '')
  const [only, setOnly] = usePersistentState<'' | 'short' | 'mine' | 'open' | 'archived'>('research.only', 'open')
  const [edit, setEdit] = useState<Lead | 'new' | null>(null)

  const load = useCallback(() => Promise.all([
    supabase.from('research_leads').select('*').order('research_date', { ascending: false }),
    supabase.rpc('list_sales_team'),
  ]).then(([r, t]) => {
    if (r.error) throw r.error
    setRows(r.data as Lead[]); setTeam(Object.fromEntries(((t.data ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])))
  }).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const countries = useMemo(() => [...new Set((rows ?? []).map((r) => r.country).filter(Boolean) as string[])].sort(), [rows])
  if (error) return <ErrorState message={/research_leads/.test(error) ? 'Market research is not installed yet. Run migration 0010_research in Supabase first.' : error} />
  if (!rows) return <Loading />

  const s = q.trim().toLowerCase()
  const list = rows.filter((r) => (only === 'archived' ? r.archived_at : !r.archived_at))
    .filter((r) => only !== 'short' || r.shortlisted).filter((r) => only !== 'mine' || r.researcher_id === me).filter((r) => only !== 'open' || !r.converted_company_id)
    .filter((r) => !country || r.country === country).filter((r) => !status || r.verification_status === status)
    .filter((r) => !s || [r.company_name, r.products_imported, r.product_origin, r.market, r.notes].some((x) => x?.toLowerCase().includes(s)))
  const canEdit = (r: Lead) => editAll || r.researcher_id === me

  async function save(v: Record<string, string>) {
    const { row, error } = toRow(v)
    if (error) { toast.error(error); return false }
    if (row.source_url && !/^https?:\/\//i.test(String(row.source_url))) { toast.error('Source link must start with http:// or https://'); return false }
    if (row.verification_status === 'verified_importer' && !row.source_url) { toast.error('A verified importer needs a source link as evidence.'); return false }
    if (!row.research_date) delete row.research_date
    if (!row.verification_status) row.verification_status = 'unverified'
    const isNew = edit === 'new'
    const res = isNew ? await supabase.from('research_leads').insert(row) : await supabase.from('research_leads').update(row).eq('id', (edit as Lead).id)
    if (res.error) { toast.error(res.error.message); return false }
    if (isNew) {
      // Warn (do not block) if this company is already in the CRM.
      const hits = await findDuplicates([{ name: v.company_name, website: v.website, email: v.email, phone: v.phone || v.whatsapp, country: v.country }]).catch(() => [])
      if (hits.length) toast.warning(`Already in CRM: ${hits[0].company_name} (owner: ${hits[0].owner_name}).`)
    }
    toast.success('Saved'); load(); return true
  }
  async function patch(r: Lead, p: Partial<Lead>) {
    const { error } = await supabase.from('research_leads').update(p).eq('id', r.id)
    if (error) toast.error(error.message); else load()
  }
  async function convert(r: Lead) {
    const hits = await findDuplicates([{ name: r.company_name, website: r.website, email: r.email, phone: r.phone || r.whatsapp, country: r.country }]).catch(() => [])
    if (hits.length) {
      const h = hits[0]
      toast.error(`“${h.company_name}” is already in the CRM (owner: ${h.owner_name}, matched on ${h.reasons.join(', ')}). Not added again.`)
      if (h.can_open) await patch(r, { converted_company_id: h.company_id })
      return
    }
    const { data, error } = await supabase.from('companies').insert({
      name: r.company_name, country: r.country, website: r.website, email: r.email, phone: r.phone, whatsapp: r.whatsapp, linkedin: r.linkedin,
      products_interested: r.products_imported, current_supplier_country: r.product_origin, target_market: r.market, lead_source: 'Market research',
      lead_status: 'new_lead', notes: [r.notes, r.source_url && `Source: ${r.source_url}`, `Research status: ${VERIFY[r.verification_status]}`].filter(Boolean).join('\n'),
    }).select('id').single()
    if (error) { toast.error(error.message); return }
    await patch(r, { converted_company_id: data.id })
    toast.success('Added to CRM'); nav(`/crm/${data.id}`)
  }
  function csv() {
    download(`market-research-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(list.map((r) => ({
      Company: r.company_name, Country: r.country, Market: r.market, 'Products imported': r.products_imported, 'Imports from': r.product_origin,
      Website: r.website, Email: r.email, Phone: r.phone, WhatsApp: r.whatsapp, LinkedIn: r.linkedin, Source: r.source_url,
      Verification: VERIFY[r.verification_status], Shortlisted: r.shortlisted ? 'Yes' : '', 'Research date': r.research_date, Researcher: team[r.researcher_id ?? ''] ?? '', 'In CRM': r.converted_company_id ? 'Yes' : '',
    }))))
  }

  return (
    <>
      <PageHeader title="Market Research" summary="Potential buyers you found, each with its source. Only companies with evidence are marked “Verified importer”."
        action={<div className="flex gap-2"><Button variant="outline" onClick={csv} disabled={!list.length}>CSV</Button><Button onClick={() => setEdit('new')}><Plus />Add research lead</Button></div>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search company, product, origin…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)} className="w-40"><option value="">All countries</option>{countries.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select aria-label="Verification" value={status} onChange={(e) => setStatus(e.target.value)} className="w-44"><option value="">Any verification</option>{Object.entries(VERIFY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select aria-label="Show" value={only} onChange={(e) => setOnly(e.target.value as typeof only)} className="w-44">
          <option value="open">Not yet in CRM</option><option value="">All</option><option value="short">Shortlisted</option><option value="mine">Added by me</option><option value="archived">Archived</option>
        </Select>
        <span className="ml-auto self-center text-sm text-muted-foreground">{list.length} of {rows.filter((r) => !r.archived_at).length}</span>
      </div>
      {list.length === 0 ? <Empty title="No research leads here" hint="Add companies you find on trade directories, LinkedIn or import records — with the link where you found them."
        action={<Button onClick={() => setEdit('new')}><Plus />Add research lead</Button>} /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2">Company</th><th className="px-3 py-2">Imports</th><th className="px-3 py-2">Verification</th><th className="px-3 py-2">Researcher</th><th className="px-3 py-2">Date</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2">
                    <button aria-label={r.shortlisted ? 'Remove from shortlist' : 'Shortlist'} disabled={!canEdit(r)} onClick={() => patch(r, { shortlisted: !r.shortlisted })}>
                      <Star className={cn('size-4', r.shortlisted ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground')} />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button className="text-left font-medium hover:underline" onClick={() => setEdit(r)}>{r.company_name}</button>
                    <div className="text-xs text-muted-foreground">{[r.country, r.market].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-3 py-2"><div>{r.products_imported || '—'}</div>{r.product_origin && <div className="text-xs text-muted-foreground">from {r.product_origin}</div>}</td>
                  <td className="px-3 py-2">
                    <Badge className={VERIFY_TONE[r.verification_status]}>{VERIFY[r.verification_status]}</Badge>
                    {r.source_url && <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="size-3" />Source</a>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{team[r.researcher_id ?? ''] ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.research_date}</td>
                  <td className="px-3 py-2 text-right">
                    {r.converted_company_id ? <Link to={`/crm/${r.converted_company_id}`} className="text-xs text-primary hover:underline">Open in CRM</Link>
                      : canEdit(r) && !r.archived_at && <Button size="sm" variant="outline" onClick={() => convert(r)}><ArrowRightCircle />Add to CRM</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <SimpleFormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'Add research lead' : 'Research lead'}
        description="Only enter what you actually found. Leave unknown fields empty." fields={FIELDS}
        initial={edit === 'new' || !edit ? { verification_status: 'unverified', research_date: new Date().toISOString().slice(0, 10) } : fromRow(edit, KEYS)}
        readOnly={edit !== 'new' && !!edit && !canEdit(edit)} onSubmit={save}
        extraFooter={edit && edit !== 'new' && canEdit(edit) ? (
          <Button variant="ghost" onClick={async () => { await patch(edit, { archived_at: edit.archived_at ? null : new Date().toISOString() }); setEdit(null) }}>{edit.archived_at ? 'Restore' : 'Archive'}</Button>
        ) : undefined} />
    </>
  )
}
