import { T } from '@/lib/i18n'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Ban, FileText, Loader2, Pencil, Plus, Printer, Save, Send, Stamp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { QUOTE_EDIT_ALL, QUOTE_WRITERS } from '@/lib/roles'
import { CURRENCIES, INCOTERMS } from '@/lib/pricing'
import { BRANDS, fetchQuotation, fmtDateDMY, lineTons, type Brand } from '@/lib/quotations'
import { fetchProforma, lineAmount, PI_STATUS, PI_STYLE, type PIStatus, type PriceUnit, type Proforma, type QtyUnitPI } from '@/lib/proformas'
import { money } from '@/lib/prices'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { StickyActions } from '@/components/ui/sticky-actions'
import { SendDialog } from '@/components/sales/SendDialog'
import { useLeaveGuard } from '@/lib/useLeaveGuard'
import { ErrorState, Loading } from '@/components/ui/states'
import { cn } from '@/lib/utils'

const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: string) => (v.trim() === '' || !isFinite(Number(v)) ? null : Number(v))
const t = (v: string) => (v.trim() === '' ? null : v.trim())
let seq = 0
type Line = { key: number; product_id: string | null; description: string; packing: string; quantity: string; unit: QtyUnitPI; net: string; price: string; price_unit: PriceUnit }
const HEAD = ['customer_company', 'customer_name', 'customer_address', 'customer_country', 'customer_email', 'customer_phone', 'incoterm', 'currency', 'destination',
  'port_of_loading', 'port_of_discharge', 'shipment_mode', 'container_details', 'estimated_shipment', 'payment_terms', 'other_charges_label', 'other_charges',
  'bank_details', 'terms', 'notes', 'issue_date'] as const
type Head = Record<(typeof HEAD)[number], string>

export function ProformaEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { hasRole, session, profile } = useAuth()
  const [pi, setPi] = useState<Proforma | null>(null)
  const [versions, setVersions] = useState<{ id: number; version: number; created_at: string }[]>([])
  const [h, setH] = useState<Head | null>(null)
  const [meta, setMeta] = useState<{ quotation_id: string | null; company_id: string | null }>({ quotation_id: null, company_id: null })
  // letterhead; the column exists from migration 0017 (hasBrand tells us it is safe to send)
  const [brand, setBrand] = useState<Brand>('ms_elbrancy')
  const [hasBrand, setHasBrand] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status: PIStatus = pi?.status ?? 'draft'
  const editable = status === 'draft' || status === 'revised'
  const canWrite = hasRole(...QUOTE_WRITERS) && (!pi || pi.created_by === session?.user.id || hasRole(...QUOTE_EDIT_ALL))
  const canEdit = canWrite && editable

  const load = useCallback(async () => {
    try {
      const bank = await supabase.from('company_settings').select('bank_details').eq('id', 1).single()
      if (isNew) {
        const base = Object.fromEntries(HEAD.map((k) => [k, ''])) as Head
        base.currency = 'USD'; base.incoterm = 'CIF'; base.issue_date = new Date().toISOString().slice(0, 10); base.shipment_mode = 'sea'
        base.bank_details = bank.data?.bank_details ?? ''
        let ls: Line[] = []
        const qid = params.get('quotation')
        if (qid) {
          const { quote: q } = await fetchQuotation(qid)
          Object.assign(base, {
            customer_company: q.customer_company ?? '', customer_name: q.customer_name ?? '', customer_country: q.customer_country ?? '',
            customer_email: q.customer_email ?? '', customer_phone: q.customer_phone ?? '', incoterm: q.incoterm ?? 'CIF', currency: q.currency,
            destination: q.destination ?? '', payment_terms: q.payment_terms ?? '',
          })
          setMeta({ quotation_id: q.id, company_id: (q as unknown as { company_id?: string | null }).company_id ?? null })
          setBrand(q.brand ?? 'ms_elbrancy')
          ls = (q.quotation_items ?? []).map((i) => {
            if (i.price_basis === 'unit' && i.unit_price) {
              // Priced per jar/bunch: keep it per piece on the proforma.
              const tons = lineTons(i)
              const pcs = i.quantity_unit === 'units' ? i.quantity : tons != null && i.net_weight_kg ? Math.round((tons * 1000) / i.net_weight_kg) : null
              return { key: ++seq, product_id: i.product_id, description: i.description, packing: i.packing ?? '', quantity: pcs ? String(pcs) : '',
                unit: 'pieces' as QtyUnitPI, net: s(i.net_weight_kg), price: s(i.unit_price), price_unit: 'piece' as PriceUnit }
            }
            const tons = lineTons(i)
            return { key: ++seq, product_id: i.product_id, description: i.description, packing: i.packing ?? '', quantity: tons != null ? String(+tons.toFixed(3)) : '',
              unit: 'tons' as QtyUnitPI, net: s(i.net_weight_kg), price: s(i.price_per_ton), price_unit: 'ton' as PriceUnit }
          })
          if (ls.some((l) => !l.quantity)) toast.message('Some lines have no quantity yet — enter them before issuing.')
        }
        setH(base); setLines(ls); setDirty(!!qid)
      } else {
        const { pi: p, versions: vs } = await fetchProforma(id!)
        setPi(p); setVersions(vs)
        setH(Object.fromEntries(HEAD.map((k) => [k, s((p as Record<string, unknown>)[k])])) as Head)
        setMeta({ quotation_id: p.quotation_id, company_id: p.company_id })
        setBrand(p.brand ?? 'ms_elbrancy'); setHasBrand('brand' in p)
        setLines((p.proforma_items ?? []).map((i) => ({ key: ++seq, product_id: i.product_id, description: i.description, packing: i.packing ?? '', quantity: s(i.quantity), unit: i.unit, net: s(i.net_weight_kg), price: s(i.unit_price), price_unit: i.price_unit })))
        setDirty(false)
      }
    } catch (e) { setError((e as Error).message) }
  }, [id, isNew, params])
  useEffect(() => { load() }, [load])

  const upd = (k: keyof Head) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setH((x) => x && ({ ...x, [k]: e.target.value })); setDirty(true) }
  const updLine = (key: number, p: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l))); setDirty(true) }
  const computed = lines.map((l) => ({ ...l, amount: lineAmount(n(l.quantity), l.unit, n(l.net), n(l.price), l.price_unit) }))
  const subtotal = computed.reduce((a, l) => a + (l.amount ?? 0), 0)
  const total = subtotal + (n(h?.other_charges ?? '') ?? 0)

  async function save(): Promise<string | null> {
    if (!h) return null
    if (!lines.length) { toast.error('Add at least one line.'); return null }
    for (const l of computed) {
      if (!l.description.trim()) { toast.error('Every line needs a description.'); return null }
      if (l.amount == null) { toast.error(`“${l.description}”: enter quantity and price (and net kg per carton when units differ).`); return null }
    }
    const row: Record<string, unknown> = Object.fromEntries(HEAD.map((k) => [k, t(h[k])]))
    row.other_charges = n(h.other_charges); row.currency = h.currency; row.issue_date = h.issue_date
    row.quotation_id = meta.quotation_id; row.company_id = meta.company_id
    if (hasBrand || brand !== 'ms_elbrancy') row.brand = brand
    setBusy('save')
    let pid = pi?.id ?? null
    if (pid) {
      const r = await supabase.from('proforma_invoices').update(row).eq('id', pid).select('id')
      if (r.error || !r.data?.length) { setBusy(null); toast.error(r.error?.message ?? 'Not allowed.'); return null }
      const d = await supabase.from('proforma_items').delete().eq('proforma_id', pid)
      if (d.error) { setBusy(null); toast.error(d.error.message); return null }
    } else {
      const r = await supabase.from('proforma_invoices').insert({ ...row, created_by: session?.user.id }).select('id').single()
      if (r.error) { setBusy(null); toast.error(r.error.message); return null }
      pid = r.data.id
    }
    const items = computed.map((l, i) => ({ proforma_id: pid, product_id: l.product_id, description: l.description.trim(), packing: t(l.packing), quantity: n(l.quantity), unit: l.unit,
      net_weight_kg: n(l.net), unit_price: n(l.price), price_unit: l.price_unit, line_total: l.amount, sort_order: i }))
    const r = await supabase.from('proforma_items').insert(items)
    setBusy(null)
    if (r.error) { toast.error('Saved, but lines failed: ' + r.error.message); return pid }
    setDirty(false); toast.success('Proforma saved')
    if (isNew) nav(`/proformas/${pid}`, { replace: true }); else load()
    return pid
  }

  async function setStatus(st: PIStatus, confirmed = false) {
    let pid = pi?.id ?? null
    if (dirty && editable) { pid = await save(); if (!pid) return }
    if (!pid) return
    const ask: Partial<Record<PIStatus, string>> = { issued: 'Issue this proforma? It will be locked and this version kept permanently.', revised: 'Open a revision? The issued version stays saved.', cancelled: 'Cancel this proforma? It stays in the list as Cancelled.' }
    if (!confirmed && ask[st] && !window.confirm(ask[st])) return
    setBusy(st)
    const { error } = await supabase.rpc('set_proforma_status', { pid, new_status: st })
    setBusy(null)
    if (error) return toast.error(error.message)
    if (st === 'issued' && meta.company_id) await supabase.from('activities').insert({ company_id: meta.company_id, kind: 'quotation', summary: `Proforma ${pi?.number ?? ''} issued`, created_by: session?.user.id })
    toast.success(`Proforma ${PI_STATUS[st].toLowerCase()}`); load()
  }
  async function printIt(version?: number) {
    let pid = pi?.id ?? null
    if (!version && dirty && canEdit) { pid = await save(); if (!pid) return }
    if (!pid) return toast.error('Save first.')
    window.open(`${location.pathname}#/proformas/${pid}/print${version ? `?v=${version}` : ''}`, '_blank')
  }
  async function remove() {
    if (!pi || !window.confirm(`Delete ${pi.number}?`)) return
    const { error, data } = await supabase.from('proforma_invoices').delete().eq('id', pi.id).select('id')
    if (error || !data?.length) return toast.error(error?.message ?? 'Only unissued drafts can be deleted.')
    nav('/proformas')
  }

  if (error) return <ErrorState message={error} />
  useLeaveGuard(dirty && canEdit, canEdit ? save : undefined)
  if (!h) return <Loading />
  const inp = (k: keyof Head, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, cls = '') => <Field label={label} className={cls}><Input value={h[k]} onChange={upd(k)} {...props} /></Field>

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => (!dirty || !canEdit || window.confirm('You have unsaved changes. Leave without saving?')) && nav('/proformas')}><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">{pi?.number ?? 'New proforma invoice'}{pi && pi.version > 1 && <span className="text-sm font-normal text-muted-foreground">rev. {pi.version}</span>}
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', PI_STYLE[status])}>{PI_STATUS[status]}</span></h1>
          <p className="text-sm text-muted-foreground">{meta.quotation_id ? 'Made from a quotation' : 'Not linked to a quotation'}{pi ? ` · ${fmtDateDMY(pi.issue_date)}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Save and Preview sit in the bar at the bottom while editing */}
          {!canEdit && <Button variant="outline" onClick={() => printIt()} disabled={!!busy}><Printer />Preview / PDF</Button>}
          {pi && h && status !== 'cancelled' && <Button variant={canWrite && editable ? 'outline' : 'default'} onClick={() => setSendOpen(true)} disabled={!!busy || !lines.length}><Send />Send</Button>}
          {canWrite && editable && <Button onClick={() => setStatus('issued')} disabled={!!busy}><Stamp />Issue</Button>}
          {canWrite && status === 'issued' && pi && <Button onClick={() => nav(`/orders/new?proforma=${pi.id}`)}><Stamp />Create order</Button>}
          {canWrite && status === 'issued' && <><Button variant="outline" onClick={() => setStatus('revised')}><Pencil />Revise</Button><Button variant="outline" onClick={() => setStatus('cancelled')}><Ban />Cancel</Button></>}
        </div>
      </div>
      {pi && h && <SendDialog open={sendOpen} onOpenChange={setSendOpen} email={h.customer_email} phone={h.customer_phone}
        doc={{ kind: 'proforma', number: pi.number, version: pi.version, lang: 'en', contactName: h.customer_name || null, company: h.customer_company,
          sender: profile?.full_name, brandName: brand === 'prime_roots' ? 'Prime Roots' : 'MS El-brancy Group' }}
        onPdf={() => printIt()} onMarkSent={canWrite && editable ? () => setStatus('issued', true) : undefined} markLabel="Issue" />}
      {!editable && <p className="mb-4 rounded-md border border-border bg-accent px-3 py-2 text-sm">This proforma is <b>{PI_STATUS[status].toLowerCase()}</b> and locked.{status === 'issued' ? ' Use Revise to change it; the issued version stays saved.' : ''}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card><CardHeader><CardTitle>Buyer</CardTitle></CardHeader><CardContent>
            <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-3">
              <Field label="Letterhead" hint="Which company the proforma is printed under." className="sm:col-span-3">
                <Select value={brand} onChange={(e) => { setBrand(e.target.value as Brand); setDirty(true) }}>
                  {(Object.keys(BRANDS) as Brand[]).map((b) => <option key={b} value={b}>{BRANDS[b].label}</option>)}
                </Select>
              </Field>
              {inp('customer_company', 'Company')}{inp('customer_name', 'Contact')}{inp('customer_country', 'Country')}
              {inp('customer_address', 'Address', {}, 'sm:col-span-3')}{inp('customer_email', 'Email')}{inp('customer_phone', 'Phone')}{inp('issue_date', 'Date', { type: 'date' })}
            </fieldset>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Shipment</CardTitle></CardHeader><CardContent>
            <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-3">
              <Field label="Incoterm"><Select value={h.incoterm} onChange={upd('incoterm')}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</Select></Field>
              {inp('destination', 'Named place')}
              <Field label="Mode"><Select value={h.shipment_mode} onChange={upd('shipment_mode')}><option value="">—</option><option value="sea">Sea</option><option value="air">Air</option><option value="land">Land</option></Select></Field>
              {inp('port_of_loading', 'Port of loading')}{inp('port_of_discharge', 'Port of discharge')}{inp('estimated_shipment', 'Estimated shipment', { type: 'date' })}
              {inp('container_details', 'Containers', { placeholder: "e.g. 2 × 40' Reefer" }, 'sm:col-span-3')}
            </fieldset>
          </CardContent></Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Lines</CardTitle><CardDescription>Quantity and price units can differ; net kg per carton is used to convert.</CardDescription></div>
              {canEdit && <Button variant="outline" size="sm" onClick={() => { setLines((ls) => [...ls, { key: ++seq, product_id: null, description: '', packing: '', quantity: '', unit: 'tons', net: '', price: '', price_unit: 'ton' }]); setDirty(true) }}><Plus />Add line</Button>}</CardHeader>
            <CardContent className="space-y-3">
              {computed.map((l) => (
                <fieldset key={l.key} disabled={!canEdit} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-12">
                  <Field label="Description" className="sm:col-span-5"><Input value={l.description} onChange={(e) => updLine(l.key, { description: e.target.value })} /></Field>
                  <Field label="Packing" className="sm:col-span-3"><Input value={l.packing} onChange={(e) => updLine(l.key, { packing: e.target.value })} /></Field>
                  <Field label="Net kg/carton" className="sm:col-span-2"><Input inputMode="decimal" value={l.net} onChange={(e) => updLine(l.key, { net: e.target.value })} /></Field>
                  <div className="flex items-end justify-end sm:col-span-2">{canEdit && <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); setDirty(true) }}><Trash2 /></Button>}</div>
                  <Field label="Quantity" className="sm:col-span-4"><div className="flex gap-1"><Input inputMode="decimal" value={l.quantity} onChange={(e) => updLine(l.key, { quantity: e.target.value })} />
                    <Select className="w-[96px]" value={l.unit} onChange={(e) => updLine(l.key, { unit: e.target.value as QtyUnitPI })} aria-label="Unit"><option value="tons">tons</option><option value="cartons">cartons</option><option value="kg">kg</option><option value="pieces">pieces</option></Select></div></Field>
                  <Field label={`Unit price (${h.currency})`} className="sm:col-span-4"><div className="flex gap-1"><Input inputMode="decimal" value={l.price} onChange={(e) => updLine(l.key, { price: e.target.value })} />
                    <Select className="w-[96px]" value={l.price_unit} onChange={(e) => updLine(l.key, { price_unit: e.target.value as PriceUnit })} aria-label="Per"><option value="ton">/ ton</option><option value="kg">/ kg</option><option value="carton">/ carton</option><option value="piece">/ piece</option></Select></div></Field>
                  <div className="flex items-end justify-end pb-2 text-sm sm:col-span-4">{l.amount != null ? <b className="tabular-nums">{money(l.amount, h.currency)}</b> : <span className="text-xs text-amber-700 dark:text-amber-300"><T>needs quantity / price / net kg</T></span>}</div>
                </fieldset>
              ))}
              <div className="grid gap-2 sm:grid-cols-3">
                <fieldset disabled={!canEdit} className="contents">{inp('other_charges_label', 'Other charges (label)', { placeholder: 'e.g. Phytosanitary certificate' }, 'sm:col-span-2')}{inp('other_charges', 'Amount', { inputMode: 'decimal' })}</fieldset>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-sm"><span>Subtotal <b className="tabular-nums">{money(subtotal, h.currency)}</b></span><span className="text-base">Total <b className="tabular-nums">{money(total, h.currency)}</b></span></div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card><CardHeader><CardTitle>Payment & bank</CardTitle></CardHeader><CardContent>
            <fieldset disabled={!canEdit} className="space-y-3">
              <Field label="Currency"><Select value={h.currency} onChange={upd('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Payment terms"><Textarea value={h.payment_terms} onChange={upd('payment_terms')} placeholder="e.g. 50% advance, 50% against copy of B/L" /></Field>
              <Field label="Bank details" hint="Default comes from Company Settings"><Textarea className="min-h-[100px]" value={h.bank_details} onChange={upd('bank_details')} /></Field>
              <Field label="Terms (printed)"><Textarea value={h.terms} onChange={upd('terms')} /></Field>
              <Field label="Internal notes (not printed)"><Textarea value={h.notes} onChange={upd('notes')} /></Field>
            </fieldset>
          </CardContent></Card>
          {pi && <Card><CardHeader><CardTitle>Issued versions</CardTitle></CardHeader><CardContent>
            {!versions.length ? <p className="text-sm text-muted-foreground"><T>Not issued yet.</T></p> : <ul className="divide-y divide-border text-sm">{versions.map((v) => <li key={v.id} className="flex items-center justify-between py-2"><span>Version {v.version} <span className="text-muted-foreground">· {new Date(v.created_at).toLocaleString()}</span></span><Button variant="ghost" size="sm" onClick={() => printIt(v.version)}><FileText />PDF</Button></li>)}</ul>}
          </CardContent></Card>}
          {canWrite && pi?.status === 'draft' && pi.version === 1 && <Button variant="ghost" className="w-full text-destructive" onClick={remove}><Trash2 />Delete draft</Button>}
        </div>
      </div>
      {canEdit && (
        <StickyActions dirty={dirty} info={<span className="text-muted-foreground">Total <b className="text-foreground tabular-nums">{money(total, h.currency)}</b></span>}>
          <Button variant="outline" onClick={() => printIt()} disabled={!!busy}><Printer />Preview / PDF</Button>
          <Button onClick={save} disabled={!!busy} title="Ctrl + S">{busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />}Save</Button>
        </StickyActions>
      )}
    </>
  )
}
