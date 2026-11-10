import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, FileText, History, Loader2, Pencil, Plus, Printer, RotateCcw, Save, Send, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { QUOTE_EDIT_ALL, QUOTE_WRITERS } from '@/lib/roles'
import { activePackaging, fetchCatalog, PRODUCT_TYPE_LABEL, type Category, type Product } from '@/lib/catalog'
import { CURRENCIES, INCOTERMS, type Incoterm } from '@/lib/pricing'
import { fetchPriceList, isExpired, money, type PriceListRow } from '@/lib/prices'
import { fetchPlan } from '@/lib/containers'
import { fetchCompanies, type Company } from '@/lib/crm'
import {
  addDays, fetchQuotation, fmtDateDMY, lineTotal, renderPolicy, STATUS_LABEL, STATUS_STYLE,
  type Quotation, type QuoteStatus, type QuoteVersion,
  BRANDS, unitToTon, unitsLabel, type Brand, type PriceBasis, type QuoteQtyUnit,
} from '@/lib/quotations'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { cn } from '@/lib/utils'

const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: string) => (v.trim() === '' || !isFinite(Number(v)) ? null : Number(v))
const t = (v: string) => (v.trim() === '' ? null : v.trim())
const today = () => new Date().toISOString().slice(0, 10)
const companyFields = (co: Company) => ({
  customer_company: co.name, customer_country: co.country ?? '', customer_email: co.email ?? '', customer_phone: co.phone ?? co.whatsapp ?? '',
  ...(co.preferred_incoterm ? { incoterm: co.preferred_incoterm } : {}), ...(co.preferred_payment_terms ? { payment_terms: co.preferred_payment_terms } : {}),
})
let seq = 0

type Line = {
  key: number; product_id: string; packaging_id: string; description: string; packing: string; product_type_label: string
  quantity: string; quantity_unit: QuoteQtyUnit; net: string; cpp: string; price: string; price_id: string | null; priceNote: string
  basis: PriceBasis; unit_price: string; unit_label: string
}
type Form = {
  customer_name: string; customer_company: string; customer_country: string; customer_email: string; customer_phone: string
  destination: string; incoterm: Incoterm; currency: string; payment_terms: string; issue_date: string
  validity_days: string; production_time: string; policy: string; show_quantities: boolean; notes: string; plan_id: string | null; company_id: string
  brand: Brand
}
type Settings = { quotation_policy: string[] | null; quotation_validity_days: number | null; quotation_production_time: string | null }

export function QuotationEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { hasRole, session } = useAuth()
  const [base, setBase] = useState<{ products: Product[]; categories: Category[]; prices: PriceListRow[]; settings: Settings; companies: Company[] } | null>(null)
  const [quote, setQuote] = useState<Quotation | null>(null)
  const [versions, setVersions] = useState<QuoteVersion[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const prod = useMemo(() => Object.fromEntries((base?.products ?? []).map((p) => [p.id, p])), [base])
  const status: QuoteStatus = quote?.status ?? 'draft'
  const editableStatus = status === 'draft' || status === 'revised'
  const mine = !quote || quote.created_by === session?.user.id
  const canWrite = hasRole(...QUOTE_WRITERS) && (mine || hasRole(...QUOTE_EDIT_ALL))
  const canEdit = canWrite && editableStatus

  const policyFrom = useCallback((st: Settings, f: Pick<Form, 'validity_days' | 'incoterm' | 'production_time'>) =>
    renderPolicy(st.quotation_policy ?? [], { validity_days: n(f.validity_days), incoterm: f.incoterm, production_time: t(f.production_time) }).join('\n'), [])

  const load = useCallback(async () => {
    try {
      const [cat, prices, companies, st] = await Promise.all([fetchCatalog(), fetchPriceList(), fetchCompanies().catch(() => [] as Company[]),
        supabase.from('company_settings').select('quotation_policy, quotation_validity_days, quotation_production_time').eq('id', 1).single()])
      if (st.error) throw st.error
      const settings = st.data as Settings
      setBase({ ...cat, prices, settings, companies })
      if (isNew) {
        const f: Form = {
          customer_name: '', customer_company: '', customer_country: '', customer_email: '', customer_phone: '', destination: '',
          incoterm: 'CIF', currency: 'USD', payment_terms: '', issue_date: today(), validity_days: s(settings.quotation_validity_days),
          production_time: settings.quotation_production_time ?? '', policy: '', show_quantities: false, notes: '', plan_id: null, company_id: '',
          brand: params.get('brand') === 'prime_roots' ? 'prime_roots' : 'ms_elbrancy',
        }
        const companyId = params.get('company')
        const co = companyId ? companies.find((x) => x.id === companyId) : undefined
        if (co) Object.assign(f, companyFields(co))
        let ls: Line[] = []
        const planId = params.get('plan')
        if (planId) {
          const p = await fetchPlan(planId)
          Object.assign(f, { customer_name: p.customer_name ?? '', destination: p.destination ?? '', incoterm: p.incoterm ?? 'CIF', currency: p.currency ?? 'USD', show_quantities: true, plan_id: p.id })
          const byId = Object.fromEntries(cat.products.map((x) => [x.id, x]))
          ls = (p.container_plan_items ?? []).map((it) => {
            const pr = byId[it.product_id]
            const pk = pr?.product_packaging.find((x) => x.id === it.packaging_id)
            return {
              key: ++seq, product_id: it.product_id, packaging_id: it.packaging_id ?? '',
              description: [pr?.name, it.variety].filter(Boolean).join(' — '), packing: pk?.label ?? '',
              product_type_label: pr ? PRODUCT_TYPE_LABEL[pr.product_type] : '', quantity: s(it.quantity), quantity_unit: it.qty_unit,
              net: s(it.net_weight_kg), cpp: s(it.cartons_per_pallet), price: s(it.price_per_ton), price_id: it.price_id,
              priceNote: it.price_id ? 'From the container plan' : '', basis: 'ton' as PriceBasis, unit_price: '', unit_label: '',
            }
          })
          toast.success('Filled from the container plan')
        }
        f.policy = policyFrom(settings, f)
        setForm(f); setLines(ls); setDirty(!!planId)
      } else {
        const { quote: q, versions: vs } = await fetchQuotation(id!)
        setQuote(q); setVersions(vs)
        setForm({
          customer_name: q.customer_name ?? '', customer_company: q.customer_company ?? '', customer_country: q.customer_country ?? '',
          customer_email: q.customer_email ?? '', customer_phone: q.customer_phone ?? '', destination: q.destination ?? '',
          incoterm: q.incoterm ?? 'CIF', currency: q.currency, payment_terms: q.payment_terms ?? '', issue_date: q.issue_date,
          validity_days: s(q.validity_days), production_time: q.production_time ?? '', policy: q.policy_lines.join('\n'),
          show_quantities: q.show_quantities, notes: q.notes ?? '', plan_id: q.plan_id, company_id: (q as Quotation & { company_id?: string | null }).company_id ?? '',
          brand: q.brand ?? 'ms_elbrancy',
        })
        setLines((q.quotation_items ?? []).map((i) => ({
          key: ++seq, product_id: i.product_id ?? '', packaging_id: i.packaging_id ?? '', description: i.description, packing: i.packing ?? '',
          product_type_label: i.product_type_label ?? '', quantity: s(i.quantity), quantity_unit: i.quantity_unit ?? 'tons',
          net: s(i.net_weight_kg), cpp: s(i.cartons_per_pallet), price: s(i.price_per_ton), price_id: i.price_id, priceNote: '',
          basis: i.price_basis ?? 'ton', unit_price: s(i.unit_price), unit_label: i.unit_label ?? '',
        })))
        setDirty(false)
      }
    } catch (e) { setError((e as Error).message) }
  }, [id, isNew, params, policyFrom])
  useEffect(() => { load() }, [load])

  const upd = (patch: Partial<Form>) => { setForm((f) => f && ({ ...f, ...patch })); setDirty(true) }
  const updLine = (key: number, patch: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); setDirty(true) }

  function findPrice(productId: string, packagingId: string, incoterm: Incoterm, currency: string) {
    const c = (base?.prices ?? []).filter((p) => p.product_id === productId && p.sell_currency === currency && !isExpired(p))
    const hit = c.find((p) => p.incoterm === incoterm && (p.packaging_id ?? '') === packagingId) ?? c.find((p) => p.incoterm === incoterm)
    const fromRow = (r: PriceListRow) => r.price_basis === 'unit' && r.unit_price
      ? { price: s(r.price_per_ton), basis: 'unit' as PriceBasis, unit_price: s(r.unit_price), unit_label: r.unit_label ?? 'unit' }
      : { price: s(r.price_per_ton), basis: 'ton' as PriceBasis, unit_price: '' }
    if (hit) return { ...fromRow(hit), price_id: hit.id, priceNote: `Price list · ${hit.incoterm}` }
    const other = c[0]
    if (other) return { ...fromRow(other), price_id: other.id, priceNote: other.incoterm ? `⚠ Price list has ${other.incoterm}, not ${incoterm}` : 'Price list (no Incoterm set)' }
    return { price: '', price_id: null, priceNote: `No ${incoterm} price in ${currency} — enter it` }
  }
  function pickProduct(key: number, productId: string, packagingId?: string) {
    const p = prod[productId]
    if (!p || !form) return updLine(key, { product_id: '' })
    const pk = activePackaging(p).find((x) => x.id === packagingId) ?? activePackaging(p)[0]
    updLine(key, {
      product_id: productId, packaging_id: pk?.id ?? '', description: p.name, packing: pk?.label ?? '',
      product_type_label: PRODUCT_TYPE_LABEL[p.product_type], net: s(pk?.net_weight_kg), cpp: s(pk?.cartons_per_pallet),
      unit_label: pk?.unit_name ?? '',
      ...findPrice(productId, pk?.id ?? '', form.incoterm, form.currency),
    })
    // Jams are sold under Prime Roots: switch the letterhead when every line is a jam.
    const others = lines.filter((l) => l.key !== key && l.product_id)
    if (p.product_type === 'jam' && form.brand !== 'prime_roots' && others.every((l) => prod[l.product_id]?.product_type === 'jam')) {
      upd({ brand: 'prime_roots' }); toast.message('Letterhead set to Prime Roots (you can change it under “Letterhead”).')
    }
  }
  const addLine = () => { setLines((ls) => [...ls, { key: ++seq, product_id: '', packaging_id: '', description: '', packing: '', product_type_label: '', quantity: '', quantity_unit: 'tons', net: '', cpp: '', price: '', price_id: null, priceNote: '', basis: 'ton', unit_price: '', unit_label: '' }]); setDirty(true) }

  const computed = lines.map((l) => ({
    ...l, total: lineTotal({ quantity: n(l.quantity), quantity_unit: n(l.quantity) ? l.quantity_unit : null, net_weight_kg: n(l.net), cartons_per_pallet: n(l.cpp),
      price_per_ton: n(l.price), price_basis: l.basis, unit_price: n(l.unit_price) }),
  }))
  const grand = computed.length && computed.every((l) => l.total != null) ? computed.reduce((a, l) => a + (l.total ?? 0), 0) : null

  async function save(): Promise<string | null> {
    if (!form) return null
    if (!lines.length) { toast.error('Add at least one product.'); return null }
    for (const l of lines) {
      if (!l.description.trim()) { toast.error('Every line needs a product description.'); return null }
      if (l.basis === 'unit') {
        if (!(n(l.unit_price)! > 0)) { toast.error(`Enter the price per ${l.unit_label || 'unit'} for “${l.description}”.`); return null }
        if (!(n(l.net)! > 0)) { toast.error(`“${l.description}” needs the weight of one ${l.unit_label || 'unit'} (choose its packing).`); return null }
      } else if (!(n(l.price)! > 0)) { toast.error(`Enter the price per ton for “${l.description}”.`); return null }
      if (l.quantity_unit === 'units' && n(l.quantity) && !(n(l.net)! > 0)) { toast.error(`“${l.description}”: quantity in units needs the unit weight (choose its packing).`); return null }
    }
    const vd = n(form.validity_days)
    const row = {
      customer_name: t(form.customer_name), customer_company: t(form.customer_company), customer_country: t(form.customer_country),
      customer_email: t(form.customer_email), customer_phone: t(form.customer_phone), destination: t(form.destination),
      incoterm: form.incoterm, currency: form.currency, payment_terms: t(form.payment_terms), issue_date: form.issue_date,
      validity_days: vd, valid_until: vd ? addDays(form.issue_date, vd) : null, production_time: t(form.production_time),
      policy_lines: form.policy.split('\n').map((x) => x.trim()).filter(Boolean), show_quantities: form.show_quantities,
      notes: t(form.notes), plan_id: form.plan_id, company_id: form.company_id || null,
      ...(form.brand !== 'ms_elbrancy' || quote?.brand ? { brand: form.brand } : {}),
    }
    setBusy('save')
    let qid = quote?.id ?? null
    if (qid) {
      const r = await supabase.from('quotations').update(row).eq('id', qid).select('id')
      if (r.error || !r.data?.length) { setBusy(null); toast.error(r.error?.message ?? 'You cannot edit this quotation.'); return null }
      const d = await supabase.from('quotation_items').delete().eq('quotation_id', qid)
      if (d.error) { setBusy(null); toast.error(d.error.message); return null }
    } else {
      const r = await supabase.from('quotations').insert({ ...row, created_by: session?.user.id }).select('id, number').single()
      if (r.error) { setBusy(null); toast.error(r.error.message); return null }
      qid = r.data.id
    }
    const items = computed.map((l, i) => ({
      quotation_id: qid, product_id: l.product_id || null, packaging_id: l.packaging_id || null, description: l.description.trim(),
      packing: t(l.packing), product_type_label: t(l.product_type_label), quantity: n(l.quantity), quantity_unit: n(l.quantity) ? l.quantity_unit : null,
      net_weight_kg: n(l.net), cartons_per_pallet: n(l.cpp) ? Math.round(n(l.cpp)!) : null,
      price_per_ton: l.basis === 'unit' ? unitToTon(n(l.unit_price)!, n(l.net)!) : n(l.price), line_total: l.total,
      price_id: l.price_id, sort_order: i,
      // unit-price fields exist from migration 0013; only sent when used
      ...(l.basis === 'unit' || quote?.brand ? { price_basis: l.basis, unit_price: l.basis === 'unit' ? n(l.unit_price) : null, unit_label: l.basis === 'unit' ? t(l.unit_label) ?? 'unit' : null } : {}),
    }))
    const r = await supabase.from('quotation_items').insert(items)
    setBusy(null)
    if (r.error) { toast.error('Saved, but the products failed: ' + r.error.message); return qid }
    setDirty(false)
    toast.success('Quotation saved')
    if (isNew) nav(`/quotations/${qid}`, { replace: true })
    else load()
    return qid
  }

  async function setStatus(st: QuoteStatus) {
    let qid = quote?.id ?? null
    if (dirty && editableStatus) { qid = await save(); if (!qid) return }
    if (!qid) return
    const ask: Partial<Record<QuoteStatus, string>> = {
      sent: 'Mark as sent? The quotation will be locked and this version kept permanently.',
      revised: 'Open a new revision? The sent version stays saved and you can edit a new version.',
      rejected: 'Mark as rejected?', expired: 'Mark as expired?',
    }
    if (ask[st] && !window.confirm(ask[st])) return
    setBusy(st)
    const { error } = await supabase.rpc('set_quotation_status', { qid, new_status: st })
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success(`Quotation ${STATUS_LABEL[st].toLowerCase()}`)
    if (form?.company_id && (st === 'sent' || st === 'accepted' || st === 'rejected')) {
      await supabase.from('activities').insert({ company_id: form.company_id, kind: 'quotation', summary: `Quotation ${quote?.number ?? ''} ${STATUS_LABEL[st].toLowerCase()}`, created_by: session?.user.id })
      if (st === 'sent') await supabase.from('companies').update({ lead_status: 'quotation_sent', last_contact_date: today() }).eq('id', form.company_id).in('lead_status', ['new_lead', 'contacted', 'interested'])
    }
    load()
  }

  async function remove() {
    if (!quote || !window.confirm(`Delete ${quote.number}? This cannot be undone.`)) return
    const { error, data } = await supabase.from('quotations').delete().eq('id', quote.id).select('id')
    if (error || !data?.length) return toast.error(error?.message ?? 'Only unsent drafts can be deleted.')
    toast.success('Quotation deleted'); nav('/quotations')
  }

  async function printIt(version?: number) {
    let qid = quote?.id ?? null
    if (!version && dirty && canEdit) { qid = await save(); if (!qid) return }
    if (!qid) return toast.error('Save the quotation first.')
    window.open(`${location.pathname}#/quotations/${qid}/print${version ? `?v=${version}` : ''}`, '_blank')
  }

  const grouped = useMemo(() => (base?.categories ?? []).map((c) => ({ c, items: (base?.products ?? []).filter((p) => p.category_id === c.id && !p.archived_at).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length), [base])

  if (error) return <ErrorState message={error} />
  if (!base || !form) return <Loading />

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => (!dirty || window.confirm('Leave without saving?')) && nav('/quotations')} aria-label="Back"><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {quote?.number ?? 'New quotation'}
            {quote && quote.version > 1 && <span className="text-sm font-normal text-muted-foreground">rev. {quote.version}</span>}
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>
          </h1>
          <p className="text-sm text-muted-foreground">{quote ? `Issued ${fmtDateDMY(quote.issue_date)}${quote.valid_until ? ` · valid until ${fmtDateDMY(quote.valid_until)}` : ''}` : 'The number is given when you save.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="outline" onClick={save} disabled={!!busy}>{busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />}Save</Button>}
          <Button variant="outline" onClick={() => printIt()} disabled={!!busy || (isNew && !lines.length)}><Printer />Preview / PDF</Button>
          {canWrite && editableStatus && <Button onClick={() => setStatus('sent')} disabled={!!busy}>{busy === 'sent' ? <Loader2 className="animate-spin" /> : <Send />}Mark as sent</Button>}
          {canWrite && status === 'sent' && <>
            <Button onClick={() => setStatus('accepted')} disabled={!!busy}><Check />Accepted</Button>
            <Button variant="outline" onClick={() => setStatus('rejected')} disabled={!!busy}><X />Rejected</Button>
            <Button variant="outline" onClick={() => setStatus('expired')} disabled={!!busy}>Expired</Button>
          </>}
          {canWrite && !editableStatus && <Button variant="outline" onClick={() => setStatus('revised')} disabled={!!busy}><Pencil />Revise</Button>}
          {canWrite && status === 'accepted' && quote && <Button onClick={() => nav(`/proformas/new?quotation=${quote.id}`)}><FileText />Create proforma</Button>}
        </div>
      </div>

      {!editableStatus && <p className="mb-4 rounded-md border border-border bg-accent px-3 py-2 text-sm">This quotation is <b>{STATUS_LABEL[status].toLowerCase()}</b> and locked. Use <b>Revise</b> to make a new version; the current one stays saved.</p>}
      {!canWrite && <p className="mb-4 rounded-md border border-border bg-accent px-3 py-2 text-sm">Read-only for your role.</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Buyer & terms</CardTitle><CardDescription>Buyer details print as “To:” only when filled (your PDF has none).</CardDescription></CardHeader>
            <CardContent>
              <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Letterhead" className="sm:col-span-2 lg:col-span-3" hint="Which company the quotation is printed under.">
                  <Select value={form.brand} onChange={(e) => upd({ brand: e.target.value as Brand })}>
                    {(Object.keys(BRANDS) as Brand[]).map((b) => <option key={b} value={b}>{BRANDS[b].label}</option>)}
                  </Select>
                </Field>
                <Field label="Company (from CRM)" className="sm:col-span-2 lg:col-span-3" hint="Choosing a company fills the buyer fields and adds this quotation to its timeline.">
                  <Select value={form.company_id} onChange={(e) => {
                    const co = base.companies.find((x) => x.id === e.target.value)
                    upd(co ? { company_id: co.id, ...companyFields(co) } : { company_id: '' })
                  }}>
                    <option value="">— Not linked —</option>
                    {base.companies.filter((x) => !x.archived_at || x.id === form.company_id).map((x) => <option key={x.id} value={x.id}>{x.name}{x.country ? ` — ${x.country}` : ''}</option>)}
                  </Select>
                </Field>
                <Field label="Contact name"><Input value={form.customer_name} onChange={(e) => upd({ customer_name: e.target.value })} /></Field>
                <Field label="Company"><Input value={form.customer_company} onChange={(e) => upd({ customer_company: e.target.value })} /></Field>
                <Field label="Country"><Input value={form.customer_country} onChange={(e) => upd({ customer_country: e.target.value })} /></Field>
                <Field label="Email (not printed)"><Input type="email" value={form.customer_email} onChange={(e) => upd({ customer_email: e.target.value })} /></Field>
                <Field label="Phone / WhatsApp (not printed)"><Input value={form.customer_phone} onChange={(e) => upd({ customer_phone: e.target.value })} /></Field>
                <Field label="Destination"><Input value={form.destination} onChange={(e) => upd({ destination: e.target.value })} /></Field>
                <Field label="Incoterm">
                  <Select value={form.incoterm} onChange={(e) => {
                    const inc = e.target.value as Incoterm
                    const policyWasDefault = form.policy === policyFrom(base.settings, form)
                    upd({ incoterm: inc, ...(policyWasDefault ? { policy: policyFrom(base.settings, { ...form, incoterm: inc }) } : {}) })
                  }}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</Select>
                </Field>
                <Field label="Currency"><Select value={form.currency} onChange={(e) => upd({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="Date"><Input type="date" value={form.issue_date} onChange={(e) => upd({ issue_date: e.target.value })} /></Field>
                <Field label="Valid for (days)" hint={n(form.validity_days) ? `until ${fmtDateDMY(addDays(form.issue_date, n(form.validity_days)!))}` : undefined}>
                  <Input inputMode="numeric" value={form.validity_days} onChange={(e) => {
                    const policyWasDefault = form.policy === policyFrom(base.settings, form)
                    upd({ validity_days: e.target.value, ...(policyWasDefault ? { policy: policyFrom(base.settings, { ...form, validity_days: e.target.value }) } : {}) })
                  }} />
                </Field>
                <Field label="Production time"><Input value={form.production_time} onChange={(e) => {
                  const policyWasDefault = form.policy === policyFrom(base.settings, form)
                  upd({ production_time: e.target.value, ...(policyWasDefault ? { policy: policyFrom(base.settings, { ...form, production_time: e.target.value }) } : {}) })
                }} /></Field>
                <Field label="Payment terms (optional)"><Input placeholder="e.g. 50% advance, 50% before shipment" value={form.payment_terms} onChange={(e) => upd({ payment_terms: e.target.value })} /></Field>
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle>Products</CardTitle><CardDescription>Description, packing and price fill in from Products and the price list. All editable.</CardDescription></div>
              {canEdit && <Button variant="outline" size="sm" onClick={addLine}><Plus />Add product</Button>}
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[#23856B]" checked={form.show_quantities} disabled={!canEdit} onChange={(e) => upd({ show_quantities: e.target.checked })} />
                Print quantity and total columns
              </label>
              {!lines.length && <Empty title="No products yet" hint={canEdit ? 'Click “Add product”.' : undefined} />}
              {computed.map((l) => {
                const p = prod[l.product_id]
                return (
                  <div key={l.key} className="rounded-md border border-border p-3">
                    <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-12">
                      <Field label="Product" className="sm:col-span-4">
                        <Select value={l.product_id} onChange={(e) => pickProduct(l.key, e.target.value)}>
                          <option value="">Choose… (or type below)</option>
                          {grouped.map(({ c, items }) => <optgroup key={c.id} label={c.name}>{items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
                        </Select>
                      </Field>
                      <Field label="Printed description" className="sm:col-span-5"><Input value={l.description} onChange={(e) => updLine(l.key, { description: e.target.value })} placeholder="e.g. Dragon Fruit — Red/White" /></Field>
                      <Field label="Product type" className="sm:col-span-3"><Input value={l.product_type_label} onChange={(e) => updLine(l.key, { product_type_label: e.target.value })} /></Field>
                      <Field label="Packing" className="sm:col-span-3">
                        {p && activePackaging(p).length > 0 ? (
                          <Select value={l.packaging_id} onChange={(e) => pickProduct(l.key, l.product_id, e.target.value)}>
                            {activePackaging(p).map((pk) => <option key={pk.id} value={pk.id}>{pk.label}</option>)}
                          </Select>
                        ) : <Input value={l.packing} onChange={(e) => updLine(l.key, { packing: e.target.value })} placeholder="e.g. 10 kg carton" />}
                      </Field>
                      <Field label="Quantity (optional)" className="sm:col-span-3">
                        <div className="flex gap-1">
                          <Input inputMode="decimal" value={l.quantity} onChange={(e) => updLine(l.key, { quantity: e.target.value })} />
                          <Select value={l.quantity_unit} onChange={(e) => updLine(l.key, { quantity_unit: e.target.value as QuoteQtyUnit })} className="w-[100px]" aria-label="Unit">
                            <option value="tons">tons</option><option value="cartons">cartons</option><option value="pallets">pallets</option>
                            <option value="units">{unitsLabel(l.unit_label)}</option>
                          </Select>
                        </div>
                      </Field>
                      <Field label={l.basis === 'unit' ? `Price / ${l.unit_label || 'unit'} (${form.currency})` : `Price / ton (${form.currency})`} hint={l.priceNote} className="sm:col-span-3">
                        <div className="flex gap-1">
                          {l.basis === 'unit'
                            ? <Input inputMode="decimal" value={l.unit_price} onChange={(e) => updLine(l.key, { unit_price: e.target.value, price_id: null, priceNote: 'Entered manually' })} />
                            : <Input inputMode="decimal" value={l.price} onChange={(e) => updLine(l.key, { price: e.target.value, price_id: null, priceNote: 'Entered manually' })} />}
                          <Select value={l.basis} aria-label="Price per" className="w-[92px]"
                            onChange={(e) => updLine(l.key, { basis: e.target.value as PriceBasis, unit_label: l.unit_label || 'unit', price_id: null, priceNote: '' })}>
                            <option value="ton">/ ton</option><option value="unit">/ {l.unit_label || 'unit'}</option>
                          </Select>
                        </div>
                      </Field>
                      <div className="flex items-end justify-between gap-2 sm:col-span-3">
                        <div className="pb-2 text-sm"><span className="text-xs text-muted-foreground">Total </span><b className="tabular-nums">{money(l.total, form.currency)}</b></div>
                        {canEdit && <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); setDirty(true) }}><Trash2 /></Button>}
                      </div>
                    </fieldset>
                  </div>
                )
              })}
              {lines.length > 0 && <div className="flex justify-end text-sm">Total: <b className="ml-2 tabular-nums">{grand != null ? money(grand, form.currency) : 'enter all quantities to see the total'}</b></div>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle>Our Policy</CardTitle><CardDescription>One line per point. Defaults come from Company Settings.</CardDescription></div>
              {canEdit && <Button variant="ghost" size="icon" title="Reset to defaults" aria-label="Reset to defaults" onClick={() => upd({ policy: policyFrom(base.settings, form) })}><RotateCcw /></Button>}
            </CardHeader>
            <CardContent><Textarea className="min-h-[170px] text-sm" disabled={!canEdit} value={form.policy} onChange={(e) => upd({ policy: e.target.value })} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Internal notes</CardTitle><CardDescription>Never printed.</CardDescription></CardHeader>
            <CardContent><Textarea disabled={!canEdit} value={form.notes} onChange={(e) => upd({ notes: e.target.value })} /></CardContent>
          </Card>
          {quote && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" />Sent versions</CardTitle><CardDescription>Saved exactly as they were sent.</CardDescription></CardHeader>
              <CardContent>
                {!versions.length ? <p className="text-sm text-muted-foreground">Not sent yet.</p> : (
                  <ul className="divide-y divide-border text-sm">
                    {versions.map((v) => (
                      <li key={v.id} className="flex items-center justify-between py-2">
                        <span>Version {v.version} <span className="text-muted-foreground">· {new Date(v.created_at).toLocaleString()}</span></span>
                        <Button variant="ghost" size="sm" onClick={() => printIt(v.version)}><FileText />PDF</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {canWrite && quote && quote.status === 'draft' && quote.version === 1 && (
            <Button variant="ghost" className="w-full text-destructive" onClick={remove}><Trash2 />Delete draft</Button>
          )}
        </div>
      </div>
    </>
  )
}
