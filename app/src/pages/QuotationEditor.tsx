import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronDown, Copy, FileText, History, Loader2, Pencil, Plane, Plus, Printer, RotateCcw, Save, Send, Ship, Trash2, Truck, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { CATALOG_MANAGERS, CONTAINER_MANAGERS, QUOTE_EDIT_ALL, QUOTE_WRITERS } from '@/lib/roles'
import { activePackaging, packOptionLabel, packsFor, fetchCatalog, PRODUCT_TYPE_LABEL, type Category, type Product } from '@/lib/catalog'
import { CURRENCIES, INCOTERMS, resolveRate, type Incoterm, type Rate } from '@/lib/pricing'
import { fetchLatestRates, fetchPriceList, isExpired, money, type PriceListRow } from '@/lib/prices'
import { fetchPlan } from '@/lib/containers'
import { fetchCompanies, type Company } from '@/lib/crm'
import {
  addDays, fetchQuotation, fmtDateDMY, lineTons, lineTotal, renderPolicy, STATUS_LABEL, STATUS_STYLE,
  type Quotation, type QuoteStatus, type QuoteVersion,
  BRANDS, packLabel, PRODUCT_TYPE_LABEL_AR, unitToTon, unitsLabel, basisPerTon, convertBasis, type Brand, type PriceBasis, type QuoteLang, type QuoteQtyUnit,
  destinationTotal, type DestLayout, type QuoteDestination,
  kgFromPacking,
} from '@/lib/quotations'
import {
  basesFor, defaultBasis, placeLabel, placePlaceholder, placeSuggestions, freightFromRate, modeOfRate, needsShipping, quoteFreight, ratesFor, sellerPaysFreight, seaOnlyTerm, SHIP_MODE_LABEL, SHIP_MODES,
  type FreightBasis, type FreightDisplay, type SavedRate, type ShipMode,
} from '@/lib/shipping'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { StickyActions } from '@/components/ui/sticky-actions'
import { SendDialog } from '@/components/sales/SendDialog'
import { ProductDialog } from '@/components/products/ProductDialog'
import { useLeaveGuard } from '@/lib/useLeaveGuard'
import { T, tr, useT } from '@/lib/i18n'
import { AWAIT_DAYS } from '@/lib/analytics'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { cn } from '@/lib/utils'

const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: string) => (v.trim() === '' || !isFinite(Number(v)) ? null : Number(v))
const t = (v: string) => (v.trim() === '' ? null : v.trim())
const today = () => new Date().toISOString().slice(0, 10)
const companyFields = (co: Company, destination = '') => ({
  // the destination starts as the buyer's country; it can be changed to a port
  ...(!destination.trim() && co.country ? { destination: co.country } : {}),
  customer_company: co.name, customer_country: co.country ?? '', customer_email: co.email ?? '', customer_phone: co.phone ?? co.whatsapp ?? '',
  ...(co.preferred_incoterm ? { incoterm: co.preferred_incoterm } : {}), ...(co.preferred_payment_terms ? { payment_terms: co.preferred_payment_terms } : {}),
})
let seq = 0

type Line = {
  key: number; product_id: string; packaging_id: string; description: string; packing: string; product_type_label: string
  netManual?: boolean // the weight was typed by hand (not read from Packing)
  quantity: string; quantity_unit: QuoteQtyUnit; net: string; cpp: string; price: string; price_id: string | null; priceNote: string
  basis: PriceBasis; unit_price: string; unit_label: string
  // currency the price was typed in; fx = typed/saved rate (1 in_ccy = fx quote currency), empty = use the latest saved rate
  in_ccy: string; fx: string; fxNote: string
  // jams: sold per jar or per shrink (a pack of jars). unit_price stays the price of ONE jar; net = one jar.
  sell?: 'jar' | 'shrink'; per_shrink?: string
  variety?: string // chosen variety (filters packing and price; printed in the description)
}
type QuoteItemRow = { input_price?: number | null; unit_price?: number | null }
type Form = {
  customer_name: string; customer_company: string; customer_country: string; customer_email: string; customer_phone: string
  destination: string; incoterm: Incoterm; currency: string; payment_terms: string; issue_date: string
  validity_days: string; production_time: string; policy: string; show_quantities: boolean; notes: string; plan_id: string | null; company_id: string
  brand: Brand; language: QuoteLang
  // shipping (migration 0022)
  shipping_mode: ShipMode | ''; freight_basis: FreightBasis; freight_rate: string; freight_currency: string; freight_fx: string
  freight_containers: string; freight_display: FreightDisplay; shipping_rate_id: string
  destinations_layout: DestLayout // several destinations: price columns or a table each (migration 0023)
}
/** Another destination of the quotation (the first one is the quotation's own Destination). */
type Dest = Pick<Form, 'destination' | 'incoterm' | 'shipping_mode' | 'freight_basis' | 'freight_rate' | 'freight_currency' | 'freight_fx' | 'freight_containers' | 'shipping_rate_id'> & { key: number }
const destFromRow = (d: QuoteDestination, currency: string): Dest => ({
  key: ++seq, destination: d.destination, incoterm: d.incoterm ?? 'CIF', shipping_mode: d.shipping_mode ?? '', freight_basis: d.freight_basis ?? defaultBasis(d.shipping_mode ?? 'sea'),
  freight_rate: s(d.freight_rate), freight_currency: d.freight_currency ?? currency, freight_fx: s(d.freight_fx), freight_containers: s(d.freight_containers), shipping_rate_id: d.shipping_rate_id ?? '',
})
type Settings = { quotation_policy: string[] | null; quotation_validity_days: number | null; quotation_production_time: string | null
  quotation_policy_ar?: string[] | null; quotation_production_time_ar?: string | null
  prime_roots_terms?: string[] | null; prime_roots_terms_ar?: string[] | null; prime_roots_validity_days?: number | null }

/** Default jars per shrink (given by Haddeer, 10 Nov 2026); editable on every line. */
const JARS_PER_SHRINK = '12'
const SHRINK_RE = [/^Shrink of (\d+) jars \((.*)\)$/, /^شرينك (\d+) برطمان \((.*)\)$/]
/** Printed packing for a shrink line, and back (to edit it again). */
const shrinkPacking = (k: number, jar: string, lang: QuoteLang) => (lang === 'ar' ? `شرينك ${k} برطمان (${jar})` : `Shrink of ${k} jars (${jar})`)
function parseShrink(packing: string): { k: number; jar: string } | null {
  for (const re of SHRINK_RE) { const m = packing.match(re); if (m) return { k: +m[1], jar: m[2] } }
  return null
}

/** The choices a person repeats on every quotation are remembered on this device. */
const DEFAULTS_KEY = 'ms_quote_defaults'
type Remembered = Partial<Pick<Form, 'currency' | 'incoterm' | 'language' | 'shipping_mode' | 'freight_display'>>
function remembered(): Remembered { try { return JSON.parse(localStorage.getItem(DEFAULTS_KEY) || '{}') as Remembered } catch { return {} } }
const MODE_ICON = { sea: Ship, air: Plane, land: Truck } as const
const PLACE_WORD: Record<ShipMode, string> = { sea: 'Port', air: 'Airport', land: 'City / border' }
const BASIS_LABEL: Record<FreightBasis, string> = { per_kg: 'per kg', per_container: 'per container', total: 'total' }
const shippingFromQuote = (q: Quotation, currency: string): Pick<Form, 'shipping_mode' | 'freight_basis' | 'freight_rate' | 'freight_currency' | 'freight_fx' | 'freight_containers' | 'freight_display' | 'shipping_rate_id'> => ({
  shipping_mode: q.shipping_mode ?? '', freight_basis: q.freight_basis ?? defaultBasis(q.shipping_mode ?? 'sea'), freight_rate: s(q.freight_rate),
  freight_currency: q.freight_currency ?? currency, freight_fx: s(q.freight_fx), freight_containers: s(q.freight_containers),
  freight_display: q.freight_display ?? 'line', shipping_rate_id: q.shipping_rate_id ?? '',
})

const Step = ({ n }: { n: number }) => <span className="me-2 inline-grid size-6 place-items-center rounded-full bg-primary/10 align-[2px] text-xs font-semibold text-primary">{n}</span>

function quoteToForm(q: Quotation, products: Product[]): { form: Form; lines: Line[]; dests: Dest[] } {
        const form: Form = {
          customer_name: q.customer_name ?? '', customer_company: q.customer_company ?? '', customer_country: q.customer_country ?? '',
          customer_email: q.customer_email ?? '', customer_phone: q.customer_phone ?? '', destination: q.destination ?? '',
          incoterm: q.incoterm ?? 'CIF', currency: q.currency, payment_terms: q.payment_terms ?? '', issue_date: q.issue_date,
          validity_days: s(q.validity_days), production_time: q.production_time ?? '', policy: q.policy_lines.join('\n'),
          show_quantities: q.show_quantities, notes: q.notes ?? '', plan_id: q.plan_id, company_id: (q as Quotation & { company_id?: string | null }).company_id ?? '',
          brand: q.brand ?? 'ms_elbrancy', language: (q as Quotation & { language?: QuoteLang }).language ?? 'en',
          ...shippingFromQuote(q, q.currency), destinations_layout: q.destinations_layout ?? 'columns',
        }
        const lines: Line[] = (q.quotation_items ?? []).map((i) => ({
          key: ++seq, product_id: i.product_id ?? '', packaging_id: i.packaging_id ?? '', description: i.description, packing: i.packing ?? '',
          product_type_label: i.product_type_label ?? '', quantity: s(i.quantity), quantity_unit: i.quantity_unit ?? 'tons',
          net: s(i.net_weight_kg), cpp: s(i.cartons_per_pallet), price: s(i.price_per_ton), price_id: i.price_id, priceNote: '',
          basis: i.price_basis ?? 'ton', unit_label: i.price_basis === 'kg' || i.price_basis === 'pallet' ? '' : i.unit_label ?? '',
          // show the price as it was typed, in its own currency, with the rate that was saved
          ...((x) => x.input_price && x.input_currency && x.input_currency !== q.currency
            ? { in_ccy: x.input_currency, fx: s(x.fx_rate), fxNote: x.fx_source ? `saved rate · ${x.fx_source}` : 'saved rate',
                price: i.price_basis && i.price_basis !== 'ton' ? s(i.price_per_ton) : s(x.input_price), unit_price: i.price_basis && i.price_basis !== 'ton' ? s(x.input_price) : s(i.unit_price) }
            // freight inside the price: show the product price as typed (without the freight)
            : i.freight_per_ton && x.input_price
              ? { in_ccy: q.currency, fx: '', fxNote: '', price: i.price_basis && i.price_basis !== 'ton' ? s(i.price_per_ton) : s(x.input_price), unit_price: i.price_basis && i.price_basis !== 'ton' ? s(x.input_price) : s(i.unit_price) }
              : { in_ccy: q.currency, fx: '', fxNote: '', unit_price: s(i.unit_price) })(i as typeof i & { input_price?: number | null; input_currency?: string | null; fx_rate?: number | null; fx_source?: string | null }),
        })).map((l, idx) => {
          // jam lines: back to "price per jar" (+ jars per shrink)
          const pr = products.find((x) => x.id === l.product_id)
          if (pr?.product_type !== 'jam' || l.basis !== 'unit') return l
          const it = (q.quotation_items ?? [])[idx] as QuoteItemRow
          const sh = l.unit_label === 'shrink' ? parseShrink(l.packing) : null
          const k = sh?.k ?? 1
          const jarPrice = it.input_price ?? (it.unit_price != null ? it.unit_price / k : null)
          return { ...l, sell: sh ? 'shrink' as const : 'jar' as const, per_shrink: sh ? String(k) : '', packing: sh?.jar ?? l.packing,
            net: l.net && sh ? s(+(n(l.net)! / k).toFixed(4)) : l.net, unit_label: 'jar', unit_price: s(jarPrice) }
        })
        // the variety was printed as "Name — Variety": pick it again so packing and price follow it
        const withVariety = lines.map((l) => {
          const pr = products.find((x) => x.id === l.product_id)
          const v = pr?.varieties.find((x) => l.description.toLowerCase().endsWith(` — ${x.toLowerCase()}`))
          return v ? { ...l, variety: v } : l
        })
        return { form, lines: withVariety, dests: (q.quotation_destinations ?? []).map((d) => destFromRow(d, q.currency)) }
}

export function QuotationEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { hasRole, session, profile } = useAuth()
  const { t: tl } = useT()
  const [base, setBase] = useState<{ products: Product[]; categories: Category[]; prices: PriceListRow[]; settings: Settings; companies: Company[]; rates: Rate[]; v14: boolean; v22: boolean; v23: boolean; shipRates: SavedRate[] } | null>(null)
  const [quote, setQuote] = useState<Quotation | null>(null)
  const [versions, setVersions] = useState<QuoteVersion[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [dirty, setDirty] = useState(false)
  const [more, setMore] = useState(false)
  // Draft safety net: unsaved edits are kept in this browser and offered back after a crash or a closed tab.
  const draftKey = `ms_qdraft:${isNew ? 'new' : id}`
  const [draft, setDraft] = useState<{ at: string; form: Form; lines: Line[]; dests?: Dest[] } | null>(null)
  const [dests, setDests] = useState<Dest[]>([])
  const dropDraft = useCallback(() => { try { localStorage.removeItem(draftKey) } catch { /* ignore */ } setDraft(null) }, [draftKey])
  useEffect(() => {
    if (!dirty || !form) return
    const h = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify({ at: new Date().toISOString(), form, lines, dests })) } catch { /* ignore */ } }, 800)
    return () => clearTimeout(h)
  }, [dirty, form, lines, dests, draftKey])
  const [busy, setBusy] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const prod = useMemo(() => Object.fromEntries((base?.products ?? []).map((p) => [p.id, p])), [base])
  // add / edit a product without leaving the quotation
  const canManageCatalog = hasRole(...CATALOG_MANAGERS)
  const [prodDlg, setProdDlg] = useState<{ key: number; product: Product | null; name?: string } | null>(null)
  const [pendingPick, setPendingPick] = useState<{ key: number; id: string; keepPrice: boolean } | null>(null)
  async function productSaved(id?: string) {
    const dlg = prodDlg
    try { const cat = await fetchCatalog(); setBase((b) => (b ? { ...b, ...cat } : b)) } catch { /* the list refreshes next time */ }
    // a new product goes straight into the line; an edited one refreshes its packing and name there
    if (id && dlg) setPendingPick({ key: dlg.key, id, keepPrice: !!dlg.product })
  }
  const status: QuoteStatus = quote?.status ?? 'draft'
  const editableStatus = status === 'draft' || status === 'revised'
  const mine = !quote || quote.created_by === session?.user.id
  const canWrite = hasRole(...QUOTE_WRITERS) && (mine || hasRole(...QUOTE_EDIT_ALL))
  const canEdit = canWrite && editableStatus

  const policyFrom = useCallback((st: Settings, f: Pick<Form, 'validity_days' | 'incoterm' | 'production_time'> & { language?: QuoteLang; brand?: Brand; currency?: string }) =>
    renderPolicy((f.brand === 'prime_roots' && st.prime_roots_terms
      ? (f.language === 'ar' ? st.prime_roots_terms_ar : st.prime_roots_terms)
      : (f.language === 'ar' ? st.quotation_policy_ar : st.quotation_policy)) ?? [], { validity_days: n(f.validity_days), incoterm: f.brand === 'prime_roots' ? null : f.incoterm, production_time: t(f.production_time), currency: f.currency }).join('\n'), [])

  const load = useCallback(async () => {
    try {
      const [cat, prices, companies, st, rates, v22q, sr, v23q] = await Promise.all([fetchCatalog(), fetchPriceList(), fetchCompanies().catch(() => [] as Company[]),
        supabase.from('company_settings').select('*').eq('id', 1).single(), fetchLatestRates().catch(() => [] as Rate[]),
        // shipping fields exist from migration 0022
        supabase.from('quotations').select('freight_display').limit(1),
        supabase.from('shipping_rates').select('id, mode, rate_per_container, rate_per_kg, additional_fees, currency, destination_country, destination_port, container_type, carrier, valid_until, archived_at'),
        // several destinations exist from migration 0023
        supabase.from('quotation_destinations').select('id').limit(1)])
      if (st.error) throw st.error
      const settings = st.data as Settings
      // Language / currency fields exist from migration 0014.
      const v14 = 'quotation_policy_ar' in (st.data as object)
      const v22 = !v22q.error
      setBase({ ...cat, prices, settings, companies, rates: rates as Rate[], v14, v22, v23: v22 && !v23q.error, shipRates: (sr.data ?? []) as SavedRate[] })
      if (isNew) {
        const f: Form = {
          customer_name: '', customer_company: '', customer_country: '', customer_email: '', customer_phone: '', destination: '',
          incoterm: 'CIF', currency: 'USD', payment_terms: '', issue_date: today(), validity_days: s(settings.quotation_validity_days),
          production_time: settings.quotation_production_time ?? '', policy: '', show_quantities: false, notes: '', plan_id: null, company_id: '',
          brand: params.get('brand') === 'prime_roots' ? 'prime_roots' : 'ms_elbrancy', language: 'en',
          shipping_mode: '', freight_basis: 'per_container', freight_rate: '', freight_currency: 'USD', freight_fx: '', freight_containers: '', freight_display: 'line', shipping_rate_id: '',
          destinations_layout: 'columns',
        }
        // start from the choices used last time on this device
        const mem = remembered()
        if (mem.currency) f.currency = f.freight_currency = mem.currency
        if (mem.incoterm) f.incoterm = mem.incoterm
        if (mem.language && v14) f.language = mem.language
        if (mem.freight_display) f.freight_display = mem.freight_display
        if (mem.shipping_mode) { f.shipping_mode = mem.shipping_mode; f.freight_basis = defaultBasis(mem.shipping_mode) }
        if (f.language === 'ar') f.production_time = settings.quotation_production_time_ar ?? f.production_time
        if (!f.shipping_mode && seaOnlyTerm(f.incoterm)) f.shipping_mode = 'sea'
        const companyId = params.get('company')
        const co = companyId ? companies.find((x) => x.id === companyId) : undefined
        if (co) Object.assign(f, companyFields(co))
        let ls: Line[] = []
        let ds: Dest[] = []
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
              priceNote: it.price_id ? 'From the container plan' : '', basis: 'ton' as PriceBasis, unit_price: '', unit_label: '', in_ccy: f.currency, fx: '', fxNote: '',
            }
          })
          toast.success('Filled from the container plan')
        }
        if (f.brand === 'prime_roots' && settings.prime_roots_validity_days) f.validity_days = s(settings.prime_roots_validity_days)
        f.policy = policyFrom(settings, f)
        const fromId = params.get('from')
        if (fromId) {
          // Duplicate: same products, prices and terms; buyer cleared so it isn't sent to the wrong company by mistake
          const { quote: src } = await fetchQuotation(fromId)
          const r = quoteToForm(src, cat.products)
          Object.assign(f, r.form, {
            customer_name: '', customer_company: '', customer_country: '', customer_email: '', customer_phone: '', destination: '',
            company_id: '', issue_date: today(), notes: '', plan_id: null,
          })
          ls = r.lines.map((l) => ({ ...l, key: ++seq }))
          ds = r.dests
          if (co) Object.assign(f, companyFields(co))
          toast.success(tr('Copied from {n}. Choose the buyer, and check the prices are still current.', { n: src.number }))
        }
        setForm(f); setLines(ls); setDests(ds); setDirty(!!planId || !!fromId)
      } else {
        const { quote: q, versions: vs } = await fetchQuotation(id!)
        setQuote(q); setVersions(vs)
        const r = quoteToForm(q, cat.products)
        setForm(r.form); setLines(r.lines); setDests(r.dests)
        setDirty(false)
      }
    } catch (e) { setError((e as Error).message) }
  }, [id, isNew, params, policyFrom])
  useEffect(() => { load() }, [load])
  const offered = useRef(false)
  useEffect(() => {
    if (offered.current || !form || (!isNew && !quote)) return
    offered.current = true
    try {
      const raw = localStorage.getItem(draftKey); if (!raw) return
      const d = JSON.parse(raw) as { at: string; form: Form; lines: Line[] }
      // only if the draft is newer than the saved quotation
      if (quote && Date.parse(quote.updated_at) >= Date.parse(d.at)) { localStorage.removeItem(draftKey); return }
      if (d.form && Array.isArray(d.lines)) setDraft(d)
    } catch { /* ignore */ }
  }, [form, quote, isNew, draftKey])
  function restoreDraft() {
    if (!draft) return
    setForm(draft.form); setLines(draft.lines.map((l) => ({ ...l, key: ++seq }))); setDests((draft.dests ?? []).map((d) => ({ ...d, key: ++seq }))); setDirty(true); setDraft(null)
    toast.success('Unsaved changes restored. Click Save to keep them.')
  }

  const upd = (patch: Partial<Form>) => { setForm((f) => f && ({ ...f, ...patch })); setDirty(true) }
  function changeIncoterm(inc: Incoterm) {
    if (!form || !base) return
    const policyWasDefault = form.policy === policyFrom(base.settings, form)
    // FOB / CFR / CIF are sea terms: pick sea for them when no shipping was chosen yet
    const ship = !form.shipping_mode && seaOnlyTerm(inc) ? { shipping_mode: 'sea' as ShipMode, freight_basis: defaultBasis('sea') } : {}
    upd({ incoterm: inc, ...ship, ...(policyWasDefault ? { policy: policyFrom(base.settings, { ...form, incoterm: inc }) } : {}) })
  }
  const updDest = (key: number, patch: Partial<Dest>) => { setDests((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d))); setDirty(true) }
  const addDest = () => {
    if (!form) return
    const key = ++seq
    // start like the first destination: same Incoterm, shipping and freight currency
    setDests((ds) => [...ds, { key, destination: '', incoterm: form.incoterm === 'EXW' ? 'CIF' : form.incoterm, shipping_mode: form.shipping_mode, freight_basis: form.freight_basis,
      freight_rate: '', freight_currency: form.freight_currency, freight_fx: '', freight_containers: form.freight_containers, shipping_rate_id: '' }])
    setDirty(true)
    setTimeout(() => document.getElementById(`d${key}-name`)?.focus(), 50)
  }
  const updLine = (key: number, patch: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); setDirty(true) }

  function findPrice(productId: string, packagingId: string, incoterm: Incoterm | null, currency: string, variety = '') {
    const v = variety.trim().toLowerCase()
    // a price for this variety first, then one for all varieties, then any other
    const rank = (r: PriceListRow) => (v && (r.variety ?? '').toLowerCase() === v ? 0 : !r.variety ? 1 : 2)
    const all = (base?.prices ?? []).filter((p) => p.product_id === productId && !isExpired(p) ).sort((a, b) => rank(a) - rank(b))
    // prefer prices already in the quotation currency; otherwise use another currency and convert
    const c = [...all.filter((p) => p.sell_currency === currency), ...all.filter((p) => p.sell_currency !== currency)]
    const hit = c.find((p) => p.incoterm === incoterm && (p.packaging_id ?? '') === packagingId) ?? c.find((p) => p.incoterm === incoterm)
    const fromRow = (r: PriceListRow) => r.price_basis && r.price_basis !== 'ton' && r.unit_price
      ? { price: s(r.price_per_ton), basis: r.price_basis as PriceBasis, unit_price: s(r.unit_price), ...(r.price_basis === 'unit' ? { unit_label: r.unit_label ?? 'unit' } : {}), in_ccy: r.sell_currency, fx: '', fxNote: '' }
      : { price: s(r.price_per_ton), basis: 'ton' as PriceBasis, unit_price: '', in_ccy: r.sell_currency, fx: '', fxNote: '' }
    if (!incoterm) {
      // jams are priced without an Incoterm: take the price for this packing
      const j = c.find((p) => (p.packaging_id ?? '') === packagingId && packagingId) ?? c.find((p) => !p.packaging_id) ?? c[0]
      return j ? { ...fromRow(j), price_id: j.id, priceNote: 'Price list' } : { price: '', price_id: null, priceNote: 'No price in the price list — enter it', in_ccy: currency, fx: '', fxNote: '' }
    }
    if (hit) return { ...fromRow(hit), price_id: hit.id, priceNote: `Price list · ${hit.incoterm}` }
    // no price for this Incoterm: prefer one for the same packing, then one without packing
    const other = c.find((p) => (p.packaging_id ?? '') === packagingId && packagingId) ?? c.find((p) => !p.packaging_id) ?? c[0]
    if (other) return { ...fromRow(other), price_id: other.id, priceNote: other.incoterm ? `⚠ Price list has ${other.incoterm}, not ${incoterm}` : 'Price list (no Incoterm set)' }
    return { price: '', price_id: null, priceNote: `No ${incoterm} price — enter it`, in_ccy: currency, fx: '', fxNote: '' }
  }
  useEffect(() => {
    if (!pendingPick || !prod[pendingPick.id]) return
    const l = lines.find((x) => x.key === pendingPick.key)
    if (pendingPick.keepPrice && l?.product_id === pendingPick.id) {
      // edited product: keep the line's price, refresh only what comes from the product
      const p = prod[pendingPick.id]
      const packs = packsFor(p, l.variety ?? '')
      const pk = packs.find((x) => x.id === l.packaging_id) ?? packs[0]
      const name = form?.language === 'ar' && p.name_ar ? p.name_ar : p.name
      updLine(l.key, { packaging_id: pk?.id ?? '', packing: pk?.label ?? l.packing, net: s(pk?.net_weight_kg) || l.net, cpp: s(pk?.cartons_per_pallet) || l.cpp,
        description: l.variety ? `${name} — ${l.variety}` : name })
    } else pickProduct(pendingPick.key, pendingPick.id)
    setPendingPick(null)
  }, [pendingPick, prod]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickProduct(key: number, productId: string, packagingId?: string, variety?: string) {
    const p = prod[productId]
    if (!p || !form) return updLine(key, { product_id: '', variety: '' })
    const cur = lines.find((l) => l.key === key)
    const v = variety ?? (cur?.product_id === productId ? cur.variety ?? '' : '')
    const packs = packsFor(p, v)
    const pk = packs.find((x) => x.id === packagingId) ?? packs[0]
    const name = form.language === 'ar' && p.name_ar ? p.name_ar : p.name
    updLine(key, {
      product_id: productId, variety: v, packaging_id: pk?.id ?? '', description: v ? `${name} — ${v}` : name, packing: pk?.label ?? '',
      product_type_label: (form.language === 'ar' ? PRODUCT_TYPE_LABEL_AR : PRODUCT_TYPE_LABEL)[p.product_type], net: s(pk?.net_weight_kg), cpp: s(pk?.cartons_per_pallet),
      unit_label: packLabel(pk),
      ...findPrice(productId, pk?.id ?? '', p.product_type === 'jam' || form.brand === 'prime_roots' ? null : form.incoterm, form.currency, v),
      ...(p.product_type === 'jam' ? jamDefaults(key) : {}),
    })
    // Jams are sold under Prime Roots: switch the letterhead when every line is a jam.
    const others = lines.filter((l) => l.key !== key && l.product_id)
    if (p.product_type === 'jam' && form.brand !== 'prime_roots' && others.every((l) => prod[l.product_id]?.product_type === 'jam')) {
      switchBrand('prime_roots'); toast.message('Letterhead set to Prime Roots (you can change it under “Letterhead”).')
    }
  }
  /** A new jam line is sold per jar, or like the other jam lines of this quotation. */
  function jamDefaults(key: number): Partial<Line> {
    const cur = lines.find((l) => l.key === key)
    const other = lines.find((l) => l.key !== key && prod[l.product_id]?.product_type === 'jam')
    const sell = cur?.sell ?? other?.sell ?? 'jar'
    return { basis: 'unit', unit_label: 'jar', quantity_unit: 'units', sell, per_shrink: cur?.per_shrink || other?.per_shrink || JARS_PER_SHRINK }
  }
  /** Brand changes the default terms and validity (only if they were still the defaults). */
  function switchBrand(brand: Brand) {
    if (!form || !base) return
    const st = base.settings
    const validityDefault = (b: Brand) => s(b === 'prime_roots' ? st.prime_roots_validity_days ?? st.quotation_validity_days : st.quotation_validity_days)
    const validity_days = form.validity_days === validityDefault(form.brand) ? validityDefault(brand) : form.validity_days
    const policyWasDefault = form.policy === policyFrom(st, form)
    const next = { ...form, brand, validity_days }
    upd({ brand, validity_days, ...(policyWasDefault ? { policy: policyFrom(st, next) } : {}) })
    const odd = lines.filter((l) => prod[l.product_id] && (brand === 'prime_roots') !== (prod[l.product_id].product_type === 'jam')).length
    if (odd) toast.warning(`${odd} product line${odd > 1 ? 's do' : ' does'} not belong to ${BRANDS[brand].label}. Remove ${odd > 1 ? 'them' : 'it'} or switch the letterhead back.`)
  }
  function switchLanguage(lang: QuoteLang) {
    if (!form || !base) return
    const st = base.settings
    const prodDefault = (l: QuoteLang) => (l === 'ar' ? st.quotation_production_time_ar : st.quotation_production_time) ?? ''
    const production_time = form.production_time === prodDefault(form.language) ? prodDefault(lang) : form.production_time
    const policyWasDefault = form.policy === policyFrom(st, form)
    const next = { ...form, language: lang, production_time }
    upd({ language: lang, production_time, ...(policyWasDefault ? { policy: policyFrom(st, next) } : {}) })
    // switch product names / type labels that were filled automatically
    setLines((ls) => ls.map((l) => {
      const p = prod[l.product_id]
      if (!p) return l
      const names = [p.name, p.name_ar].filter(Boolean)
      const types = [PRODUCT_TYPE_LABEL[p.product_type], PRODUCT_TYPE_LABEL_AR[p.product_type]]
      return {
        ...l,
        description: names.includes(l.description) ? (lang === 'ar' && p.name_ar ? p.name_ar : p.name) : l.description,
        product_type_label: types.includes(l.product_type_label as never) ? (lang === 'ar' ? PRODUCT_TYPE_LABEL_AR : PRODUCT_TYPE_LABEL)[p.product_type] : l.product_type_label,
      }
    }))
    if (lang === 'ar') toast.message('Arabic: product names come from each product’s “Arabic name”; you can edit any printed text.')
  }
  // new line: scroll to it and put the cursor in its Product box
  const [focusKey, setFocusKey] = useState<number | null>(null)
  useEffect(() => {
    if (focusKey == null) return
    const el = document.getElementById(`line-${focusKey}-product`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus({ preventScroll: true })
    setFocusKey(null)
  }, [focusKey])
  const addLine = () => { const key = seq + 1; setFocusKey(key); setLines((ls) => [...ls, { key: ++seq, product_id: '', packaging_id: '', description: '', packing: '', product_type_label: '', quantity: '', quantity_unit: 'tons', net: '', cpp: '', price: '', price_id: null, priceNote: '', basis: 'ton', unit_price: '', unit_label: '', in_ccy: form?.currency ?? 'USD', fx: '', fxNote: '' }]); setDirty(true) }

  // Rate to show a line's price in the quotation currency: typed/saved rate first, else the latest saved rate.
  const rateFor = (l: Line) => {
    const to = form?.currency ?? l.in_ccy
    if (l.in_ccy === to) return { rate: 1, source: '', rate_at: '', path: '' }
    if (n(l.fx)! > 0) return { rate: n(l.fx)!, source: l.fxNote || 'typed by you', rate_at: new Date().toISOString(), path: `${l.in_ccy}→${to}` }
    return resolveRate(l.in_ccy, to, base?.rates ?? [])
  }
  const r2 = (x: number) => Math.round(x * 100) / 100
  const r4 = (x: number) => Math.round(x * 1e4) / 1e4
  const isJam = (l: Line) => prod[l.product_id]?.product_type === 'jam' && l.basis === 'unit'
  /** Weight of one carton/jar: the saved or typed one, else read from the Packing text ("3 kg"). */
  const netOf = (l: Line) => n(l.net) ?? kgFromPacking(l.packing)
  const computed = lines.map((l) => {
    const fx = rateFor(l)
    if (isJam(l)) {
      // price is per jar; a shrink = per_shrink jars
      const k = l.sell === 'shrink' ? n(l.per_shrink ?? '') : 1
      const jarFinal = n(l.unit_price) && fx ? r2(n(l.unit_price)! * fx.rate) : null
      const unitFinal = jarFinal && k ? r2(jarFinal * k) : null
      const effNet = netOf(l) && k ? +(netOf(l)! * k).toFixed(4) : null
      const effLabel = l.sell === 'shrink' ? 'shrink' : 'jar'
      const tonFinal = unitFinal && effNet ? unitToTon(unitFinal, effNet) : null
      return {
        ...l, fxr: fx, unitFinal, tonFinal, jarFinal, effNet, effLabel, k, factor: effNet ? 1000 / effNet : null,
        tons: lineTons({ quantity: n(l.quantity), quantity_unit: n(l.quantity) ? 'units' : null, net_weight_kg: effNet, cartons_per_pallet: null }),
      }
    }
    const net = netOf(l)
    // the typed price (per ton / kg / carton / pallet) in the quotation currency, and its per-ton equivalent
    const perTonFactor = basisPerTon(l.basis, net, n(l.cpp))
    const unitFinal = l.basis !== 'ton' && n(l.unit_price) && fx ? (l.basis === 'kg' ? r4 : r2)(n(l.unit_price)! * fx.rate) : null
    const tonFinal = !fx ? null : l.basis !== 'ton' ? (unitFinal && perTonFactor ? r2(unitFinal * perTonFactor) : null) : n(l.price) ? r2(n(l.price)! * fx.rate) : null
    return {
      ...l, fxr: fx, unitFinal, tonFinal, jarFinal: null, effNet: net, effLabel: l.unit_label, k: 1, factor: perTonFactor,
      tons: lineTons({ quantity: n(l.quantity), quantity_unit: n(l.quantity) ? l.quantity_unit : null, net_weight_kg: net, cartons_per_pallet: n(l.cpp) }),
    }
  })

  // Shipping: shown for every Incoterm but EXW; its cost only when we pay the freight (CFR, CIF, CPT, CIP, DAP, DDP).
  const shipOn = !!form && !!base?.v22 && form.brand !== 'prime_roots' && needsShipping(form.incoterm)
  const freightOn = shipOn && !!form!.shipping_mode && sellerPaysFreight(form!.incoterm)
  const freightFx = !form || form.freight_currency === form.currency ? (form ? { rate: 1, source: '', rate_at: '', path: '' } : null)
    : n(form.freight_fx)! > 0 ? { rate: n(form.freight_fx)!, source: 'typed by you', rate_at: new Date().toISOString(), path: '' }
    : resolveRate(form.freight_currency, form.currency, base?.rates ?? [])
  const totalNetKg = computed.length && computed.every((l) => l.tons != null) ? computed.reduce((a, l) => a + l.tons! * 1000, 0) : null
  const freight = quoteFreight({
    basis: freightOn ? form!.freight_basis : null, rate: n(form?.freight_rate ?? ''), fx: freightFx?.rate ?? null,
    containers: n(form?.freight_containers ?? ''), netKg: totalNetKg,
  })
  // several destinations: every destination's freight goes inside its own prices
  const multi = !!base?.v23 && dests.length > 0
  const inPrices = freightOn && (form!.freight_display === 'in_prices' || multi)
  const fxTo = (ccy: string, typed: string) => !form || ccy === form.currency ? { rate: 1, source: '', rate_at: '', path: '' }
    : n(typed)! > 0 ? { rate: n(typed)!, source: 'typed by you', rate_at: new Date().toISOString(), path: '' } : resolveRate(ccy, form.currency, base?.rates ?? [])
  const destCalc = dests.map((d) => {
    const on = !!d.shipping_mode && sellerPaysFreight(d.incoterm)
    const fx = fxTo(d.freight_currency, d.freight_fx)
    const fr = quoteFreight({ basis: on ? d.freight_basis : null, rate: n(d.freight_rate), fx: fx?.rate ?? null, containers: n(d.freight_containers), netKg: totalNetKg })
    return { d, on, fx, fr, fpt: on && n(d.freight_rate) ? fr.perTon : 0 }
  })
  // the price that is saved and printed: the product price, plus its freight share when the freight goes inside the prices
  const priced = computed.map((l) => {
    const fpt = inPrices && freight.perTon ? freight.perTon : 0
    const tonSave = l.tonFinal != null ? r2(l.tonFinal + fpt) : null
    const unitSave = l.unitFinal != null && (isJam(l) || l.basis !== 'ton') ? (l.factor ? (l.basis === 'kg' ? r4 : r2)(l.unitFinal + fpt / l.factor) : null) : l.unitFinal
    const total = isJam(l)
      ? lineTotal({ quantity: n(l.quantity), quantity_unit: n(l.quantity) ? 'units' : null, net_weight_kg: l.effNet, cartons_per_pallet: null, price_per_ton: tonSave, price_basis: 'unit', unit_price: unitSave })
      : lineTotal({ quantity: n(l.quantity), quantity_unit: n(l.quantity) ? l.quantity_unit : null, net_weight_kg: l.effNet, cartons_per_pallet: n(l.cpp), price_per_ton: tonSave, price_basis: l.basis, unit_price: unitSave })
    return { ...l, fpt, tonSave, unitSave, total }
  })
  const goods = priced.length && priced.every((l) => l.total != null) ? priced.reduce((a, l) => a + (l.total ?? 0), 0) : null
  const freightLine = freightOn && !inPrices ? freight.total : null
  const grand = goods != null ? r2(goods + (freightLine ?? 0)) : null
  // what each other destination comes to, with its own freight instead of the first one's
  const asItems = priced.map((l) => ({ price_per_ton: l.tonSave ?? 0, price_basis: isJam(l) ? 'unit' as PriceBasis : l.basis, unit_price: l.unitSave, freight_per_ton: l.fpt,
    quantity: n(l.quantity), quantity_unit: n(l.quantity) ? (isJam(l) ? 'units' as QuoteQtyUnit : l.quantity_unit) : null, net_weight_kg: l.effNet, cartons_per_pallet: n(l.cpp) }))
  const destTotals = destCalc.map((c) => (c.fpt == null ? null : destinationTotal(asItems, c.fpt)))

  async function save(): Promise<string | null> {
    if (!form) return null
    if (!lines.length) { toast.error('Add at least one product.'); return null }
    for (const l of lines) {
      if (!l.description.trim()) { toast.error('Every line needs a product description.'); return null }
      if (isJam(l) && l.sell === 'shrink' && !(Number.isInteger(n(l.per_shrink ?? '')) && n(l.per_shrink ?? '')! > 0)) { toast.error(`“${l.description}”: enter how many jars are in one shrink.`); return null }
      if (l.basis === 'pallet' && !(netOf(l)! > 0 && n(l.cpp)! > 0)) { toast.error(tl('“{d}”: a price per pallet needs the kg per carton and the cartons per pallet.', { d: l.description })); return null }
      if (l.basis === 'kg' && !(n(l.unit_price)! > 0)) { toast.error(tl('Enter the price per kg for “{d}”.', { d: l.description })); return null }
      if (l.basis === 'unit') {
        if (!(n(l.unit_price)! > 0)) { toast.error(`Enter the price per ${l.unit_label || 'unit'} for “${l.description}”.`); return null }
        if (!(netOf(l)! > 0)) { toast.error(tl('“{d}”: write the weight of one {u} — e.g. “3 kg” in Packing, or fill “Net kg per {u}”.', { d: l.description, u: tl(l.unit_label || 'carton') })); setFocusKey(l.key); document.getElementById(`line-${l.key}-net`)?.focus(); return null }
      } else if (!(n(l.price)! > 0)) { toast.error(`Enter the price per ton for “${l.description}”.`); return null }
      if (l.in_ccy !== form.currency && !rateFor(l)) { toast.error(`“${l.description}”: enter the rate 1 ${l.in_ccy} = ? ${form.currency} (or add it in Pricing → Exchange rates).`); return null }
      if ((l.quantity_unit === 'units' || l.quantity_unit === 'cartons') && n(l.quantity) && !(netOf(l)! > 0)) { toast.error(tl('“{d}”: write the weight of one {u} — e.g. “3 kg” in Packing, or fill “Net kg per {u}”.', { d: l.description, u: tl(l.unit_label || 'carton') })); document.getElementById(`line-${l.key}-net`)?.focus(); return null }
    }
    if (freightOn) {
      if (n(form.freight_rate) != null && !(n(form.freight_rate)! > 0)) { toast.error(tl('The freight amount must be more than 0.')); return null }
      if (n(form.freight_rate) && form.freight_basis === 'per_container' && !(n(form.freight_containers)! > 0)) { toast.error(tl('Enter how many containers.')); document.getElementById('freight-containers')?.focus(); return null }
      if (n(form.freight_rate) && !freightFx) { toast.error(tl('Enter the rate 1 {a} = ? {b} for the freight (or add it in Pricing → Exchange rates).', { a: form.freight_currency, b: form.currency })); return null }
      if (inPrices && n(form.freight_rate) && freight.perTon == null) { toast.error(tl('To put the freight inside the prices, enter the quantity of every product — or show the freight as a separate line.')); return null }
    }
    if (multi) {
      if (freightOn && n(form.freight_rate) && freight.perTon == null) { toast.error(tl('With several destinations the freight goes inside the prices: enter the quantity of every product.')); return null }
      for (const [i, c] of destCalc.entries()) {
        const name = c.d.destination.trim() || tl('Destination {n}', { n: i + 2 })
        if (!c.d.destination.trim()) { toast.error(tl('Write the name of destination {n} (port or airport), or remove it.', { n: i + 2 })); document.getElementById(`d${c.d.key}-name`)?.focus(); return null }
        if (!c.on || !n(c.d.freight_rate)) continue
        if (c.d.freight_basis === 'per_container' && !(n(c.d.freight_containers)! > 0)) { toast.error(`${name}: ${tl('Enter how many containers.')}`); document.getElementById(`d${c.d.key}-freight-containers`)?.focus(); return null }
        if (!c.fx) { toast.error(`${name}: ${tl('Enter the rate 1 {a} = ? {b} for the freight (or add it in Pricing → Exchange rates).', { a: c.d.freight_currency, b: form.currency })}`); return null }
        if (c.fr.perTon == null) { toast.error(`${name}: ${tl(c.fr.missing ?? 'Enter the freight amount.')}`); return null }
      }
    }
    const hasFreight = freightOn && !!n(form.freight_rate)
    const shipping = base?.v22 ? {
      shipping_mode: shipOn && form.shipping_mode ? form.shipping_mode : null,
      freight_basis: hasFreight ? form.freight_basis : null, freight_rate: hasFreight ? n(form.freight_rate) : null,
      freight_currency: hasFreight ? form.freight_currency : null,
      freight_fx: hasFreight && form.freight_currency !== form.currency ? freightFx?.rate ?? null : null,
      freight_containers: hasFreight && form.freight_basis === 'per_container' ? n(form.freight_containers) : null,
      freight_display: multi && freightOn ? 'in_prices' : form.freight_display, freight_total: hasFreight ? freight.total : null,
      shipping_rate_id: hasFreight && form.shipping_rate_id ? form.shipping_rate_id : null,
      ...(base?.v23 ? { destinations_layout: form.destinations_layout } : {}),
    } : {}
    const vd = n(form.validity_days)
    const row = {
      customer_name: t(form.customer_name), customer_company: t(form.customer_company), customer_country: t(form.customer_country),
      customer_email: t(form.customer_email), customer_phone: t(form.customer_phone), destination: t(form.destination),
      incoterm: form.brand === 'prime_roots' ? null : form.incoterm, currency: form.currency, payment_terms: t(form.payment_terms), issue_date: form.issue_date,
      validity_days: vd, valid_until: vd ? addDays(form.issue_date, vd) : null, production_time: t(form.production_time),
      policy_lines: form.policy.split('\n').map((x) => x.trim()).filter(Boolean), show_quantities: form.show_quantities,
      notes: t(form.notes), plan_id: form.plan_id, company_id: form.company_id || null,
      ...(form.brand !== 'ms_elbrancy' || quote?.brand || base?.v14 ? { brand: form.brand } : {}),
      ...(base?.v14 ? { language: form.language } : {}),
      ...shipping,
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
    const items = priced.map((l, i) => ({
      quotation_id: qid, product_id: l.product_id || null, packaging_id: l.packaging_id || null, description: l.description.trim(),
      packing: isJam(l) && l.sell === 'shrink' && l.k ? shrinkPacking(l.k, l.packing.trim(), form.language) : t(l.packing),
      product_type_label: t(l.product_type_label), quantity: n(l.quantity), quantity_unit: n(l.quantity) ? (isJam(l) ? 'units' : l.quantity_unit) : null,
      net_weight_kg: l.effNet, cartons_per_pallet: n(l.cpp) ? Math.round(n(l.cpp)!) : null,
      price_per_ton: l.tonSave, line_total: l.total,
      price_id: l.price_id, sort_order: i,
      ...(base?.v22 ? { freight_per_ton: l.fpt || null } : {}),
      // unit-price fields exist from migration 0013; only sent when used
      ...(l.basis !== 'ton' || quote?.brand || base?.v14 ? {
        price_basis: l.basis, unit_price: l.basis !== 'ton' ? l.unitSave : null,
        unit_label: l.basis === 'kg' ? 'kg' : l.basis === 'pallet' ? 'pallet' : l.basis === 'unit' ? t(l.effLabel ?? '') ?? 'unit' : null,
      } : {}),
      // price as typed + rate (migration 0014)
      ...(base?.v14 ? {
        input_currency: l.in_ccy, input_price: l.basis !== 'ton' ? n(l.unit_price) : n(l.price),
        fx_rate: l.in_ccy === form.currency ? null : l.fxr?.rate ?? null, fx_source: l.in_ccy === form.currency ? null : l.fxr?.source || l.fxr?.path || null,
        fx_rate_at: l.in_ccy === form.currency ? null : l.fxr?.rate_at || null,
      } : {}),
    }))
    const r = await supabase.from('quotation_items').insert(items)
    if (r.error) { setBusy(null); toast.error('Saved, but the products failed: ' + r.error.message); return qid }
    if (base?.v23) {
      // the other destinations: replaced as a whole, like the lines
      const del = await supabase.from('quotation_destinations').delete().eq('quotation_id', qid)
      const rows = destCalc.map((c, i) => {
        const has = c.on && !!n(c.d.freight_rate)
        return {
          quotation_id: qid, sort_order: i + 1, destination: c.d.destination.trim(), incoterm: c.d.incoterm,
          shipping_mode: c.d.shipping_mode || null, freight_basis: has ? c.d.freight_basis : null, freight_rate: has ? n(c.d.freight_rate) : null,
          freight_currency: has ? c.d.freight_currency : null, freight_fx: has && c.d.freight_currency !== form.currency ? c.fx?.rate ?? null : null,
          freight_containers: has && c.d.freight_basis === 'per_container' ? n(c.d.freight_containers) : null,
          freight_total: has ? c.fr.total : null, freight_per_ton: has ? c.fpt : null, shipping_rate_id: has && c.d.shipping_rate_id ? c.d.shipping_rate_id : null,
        }
      })
      const ins = !del.error && rows.length ? await supabase.from('quotation_destinations').insert(rows) : { error: del.error }
      if (ins.error) { setBusy(null); toast.error(tl('Saved, but the other destinations failed: {e}', { e: ins.error.message })); return qid }
    }
    setBusy(null)
    setDirty(false); dropDraft()
    try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ currency: form.currency, incoterm: form.incoterm, language: form.language, freight_display: form.freight_display, ...(form.shipping_mode ? { shipping_mode: form.shipping_mode } : {}) } satisfies Remembered)) } catch { /* ignore */ }
    toast.success('Quotation saved')
    if (isNew) nav(`/quotations/${qid}`, { replace: true })
    else load()
    return qid
  }

  async function setStatus(st: QuoteStatus, confirmed = false) {
    let qid = quote?.id ?? null
    if (dirty && editableStatus) { qid = await save(); if (!qid) return }
    if (!qid) return
    const ask: Partial<Record<QuoteStatus, string>> = {
      sent: 'Mark as sent? The quotation will be locked and this version kept permanently.',
      revised: 'Open a new revision? The sent version stays saved and you can edit a new version.',
      rejected: 'Mark as rejected?', expired: 'Mark as expired?',
    }
    if (!confirmed && ask[st] && !window.confirm(tr(ask[st]))) return
    setBusy(st)
    const { error } = await supabase.rpc('set_quotation_status', { qid, new_status: st })
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success(tr('Quotation: {status}', { status: tr(STATUS_LABEL[st]) }))
    // accepted → the next step is the proforma: one tap
    if (st === 'accepted') toast.message(tr('Next step: the proforma invoice.'), { duration: 10000, action: { label: tr('Create proforma'), onClick: () => startProforma(qid!) } })
    if (form?.company_id && (st === 'sent' || st === 'accepted' || st === 'rejected')) {
      await supabase.from('activities').insert({ company_id: form.company_id, kind: 'quotation', summary: `Quotation ${quote?.number ?? ''} ${STATUS_LABEL[st].toLowerCase()}`, created_by: session?.user.id })
      if (st === 'sent') await supabase.from('companies').update({ lead_status: 'quotation_sent', last_contact_date: today() }).eq('id', form.company_id).in('lead_status', ['new_lead', 'contacted', 'interested'])
    }
    if (st === 'sent' && session) await addFollowUp(quote?.number ?? '', form?.customer_company || form?.customer_name || '')
    load()
  }

  /** After sending: a follow-up task in AWAIT_DAYS days, with Undo. */
  async function addFollowUp(number: string, who: string) {
    const d = new Date(); d.setDate(d.getDate() + AWAIT_DAYS)
    const due = d.toISOString().slice(0, 10)
    const { data, error } = await supabase.from('tasks').insert({
      title: `Follow up on quotation ${number}${who ? ` · ${who}` : ''}`, company_id: form?.company_id || null,
      assignee_id: session!.user.id, created_by: session!.user.id, due_date: due, priority: 'medium', status: 'open',
    }).select('id').single()
    if (error || !data) return
    toast.message(tr('Follow-up task added for {date}', { date: fmtDateDMY(due) }), {
      duration: 8000,
      action: { label: 'Undo', onClick: async () => { await supabase.from('tasks').delete().eq('id', data.id); toast.success('Follow-up removed') } },
    })
  }

  /** Several destinations: the buyer picks one, and the proforma is made for it. */
  const [destPick, setDestPick] = useState<string | null>(null)
  function startProforma(qid: string) {
    if ((quote?.quotation_destinations ?? []).length) setDestPick(qid)
    else nav(`/proformas/new?quotation=${qid}`)
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

  // Prime Roots sells jams only; MS El-brancy everything else
  const forBrand = useCallback((p: Product) => (form?.brand === 'prime_roots') === (p.product_type === 'jam'), [form?.brand])
  const grouped = useMemo(() => (base?.categories ?? []).map((c) => ({ c, items: (base?.products ?? []).filter((p) => p.category_id === c.id && !p.archived_at && forBrand(p)).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length), [base, forBrand])

  useLeaveGuard(dirty && canEdit, canEdit ? save : undefined)
  if (error) return <ErrorState message={error} />
  if (!base || !form) return <Loading />

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => (!dirty || !canEdit || window.confirm('You have unsaved changes. Leave without saving?')) && nav('/quotations')} aria-label={tl('Back')}><ArrowLeft className="rtl:-scale-x-100" /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {quote?.number ?? tl('New quotation')}
            {quote && quote.version > 1 && <span className="text-sm font-normal text-muted-foreground">{tl('rev.')} {quote.version}</span>}
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>{tl(STATUS_LABEL[status])}</span>
          </h1>
          <p className="text-sm text-muted-foreground">{quote ? `${tl('Issued {date}', { date: fmtDateDMY(quote.issue_date) })}${quote.valid_until ? ` · ${tl('valid until {date}', { date: fmtDateDMY(quote.valid_until) })}` : ''}` : tl('The number is given when you save.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Save and Preview sit in the bar at the bottom while editing */}
          {!canEdit && <Button variant="outline" onClick={() => printIt()} disabled={!!busy || (isNew && !lines.length)}><Printer />Preview / PDF</Button>}
          {quote && hasRole(...QUOTE_WRITERS) && <Button variant="outline" onClick={() => (!dirty || window.confirm('You have unsaved changes. Leave without saving?')) && nav(`/quotations/new?from=${quote.id}`)} data-tip={tl('New quotation with the same products and terms')}><Copy />Duplicate</Button>}
          {quote && form && status !== 'rejected' && status !== 'expired' && <Button variant={canWrite && editableStatus ? 'default' : 'outline'} onClick={() => setSendOpen(true)} disabled={!!busy || !lines.length}><Send />Send</Button>}
          {canWrite && editableStatus && <Button variant="outline" onClick={() => setStatus('sent')} disabled={!!busy}>{busy === 'sent' ? <Loader2 className="animate-spin" /> : <Check />}Mark as sent</Button>}
          {canWrite && status === 'sent' && <>
            <Button onClick={() => setStatus('accepted')} disabled={!!busy}><Check />Accepted</Button>
            <Button variant="outline" onClick={() => setStatus('rejected')} disabled={!!busy}><X />Rejected</Button>
            <Button variant="outline" onClick={() => setStatus('expired')} disabled={!!busy}>Expired</Button>
          </>}
          {canWrite && !editableStatus && <Button variant="outline" onClick={() => setStatus('revised')} disabled={!!busy}><Pencil />Revise</Button>}
          {canWrite && status === 'accepted' && quote && <Button onClick={() => startProforma(quote.id)}><FileText />Create proforma</Button>}
        </div>
      </div>

      {!editableStatus && <p className="mb-4 rounded-md border border-border bg-accent px-3 py-2 text-sm">{tl('This quotation is “{status}” and locked. Use “Revise” to make a new version; the current one stays saved.', { status: tl(STATUS_LABEL[status]) })}</p>}
      {!canWrite && <p className="mb-4 rounded-md border border-border bg-accent px-3 py-2 text-sm">{tl('Read-only for your role.')}</p>}

      {draft && canEdit && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100" role="status">
          <History className="size-4 shrink-0" />
          <span className="flex-1">You have unsaved changes from {new Date(draft.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} on this device.</span>
          <Button size="sm" onClick={restoreDraft}>Restore them</Button>
          <Button size="sm" variant="ghost" onClick={dropDraft}>Discard</Button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle><Step n={1} />Buyer & terms</CardTitle><CardDescription>Buyer details print as “To:” only when filled (your PDF has none).</CardDescription></CardHeader>
            <CardContent>
              <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Company (from CRM)" className="sm:col-span-2 lg:col-span-3" hint="Choosing a company fills the buyer fields and adds this quotation to its timeline.">
                  <Select value={form.company_id} onChange={(e) => {
                    const co = base.companies.find((x) => x.id === e.target.value)
                    upd(co ? { company_id: co.id, ...companyFields(co, form.destination) } : { company_id: '' })
                  }}>
                    <option value="">— Not linked —</option>
                    {base.companies.filter((x) => !x.archived_at || x.id === form.company_id).map((x) => <option key={x.id} value={x.id}>{x.name}{x.country ? ` — ${x.country}` : ''}</option>)}
                  </Select>
                </Field>
                <Field label="Contact name"><Input value={form.customer_name} onChange={(e) => upd({ customer_name: e.target.value })} /></Field>
                <Field label="Company"><Input value={form.customer_company} onChange={(e) => upd({ customer_company: e.target.value })} /></Field>
                <Field label="Country"><Input value={form.customer_country} onChange={(e) => upd({ customer_country: e.target.value })} /></Field>
                {/* the name follows the shipping: a port by sea, an airport by air */}
                <Field label={shipOn ? placeLabel(form.shipping_mode) : 'Destination'}>
                  <Input value={form.destination} list={shipOn && form.shipping_mode ? `places-${form.shipping_mode}` : undefined}
                    placeholder={shipOn ? tl(placePlaceholder(form.shipping_mode)) : undefined} onChange={(e) => upd({ destination: e.target.value })} />
                </Field>
                {SHIP_MODES.map((m) => <datalist key={m} id={`places-${m}`}>{placeSuggestions(base.shipRates, m).map((x) => <option key={x} value={x} />)}</datalist>)}
                {form.brand !== 'prime_roots' && <Field label="Incoterm">
                  <Select value={form.incoterm} onChange={(e) => changeIncoterm(e.target.value as Incoterm)}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</Select>
                </Field>}
                <Field label="Quotation currency" hint="Prices typed in another currency are converted to this one.">
                  <Select value={form.currency} onChange={(e) => {
                    // saved rates were to the old currency: use the latest rates for the new one
                    setLines((ls) => ls.map((l) => ({ ...l, fx: '', fxNote: '' })))
                    const policyWasDefault = form.policy === policyFrom(base.settings, form)
                    upd({ currency: e.target.value, ...(policyWasDefault ? { policy: policyFrom(base.settings, { ...form, currency: e.target.value }) } : {}) })
                  }}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
                </Field>
                {shipOn && <ShippingBox form={form} upd={upd} freight={freight} freightFx={freightFx} freightOn={freightOn} rates={base.shipRates} canAddRates={hasRole(...CONTAINER_MANAGERS)} totalNetKg={totalNetKg}
                  onIncoterm={changeIncoterm}
                  title={multi ? `${tl('Destination {n}', { n: 1 })}: ${form.destination.trim() || '…'}` : undefined} showDisplay={!multi}
                  note={multi && freightOn ? <p className="text-xs text-muted-foreground">{tl('With several destinations, each destination’s freight goes inside its own prices.')}</p> : undefined} />}
                {base.v23 && form.brand !== 'prime_roots' && <>
                  {destCalc.map((c, i) => (
                    <ShippingBox key={c.d.key} idp={`d${c.d.key}-`} form={{ ...c.d, currency: form.currency, freight_display: 'in_prices' }} upd={(p) => updDest(c.d.key, p)}
                      freight={c.fr} freightFx={c.fx} freightOn={c.on} rates={base.shipRates} canAddRates={hasRole(...CONTAINER_MANAGERS)} totalNetKg={totalNetKg} showDisplay={false}
                      onIncoterm={(i) => updDest(c.d.key, { incoterm: i })}
                      header={
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label={`${tl('Destination {n}', { n: i + 2 })}${c.d.shipping_mode ? ` · ${tl(PLACE_WORD[c.d.shipping_mode])}` : ''}`} className="min-w-[180px] flex-1">
                            <Input id={`d${c.d.key}-name`} value={c.d.destination} list={c.d.shipping_mode ? `places-${c.d.shipping_mode}` : undefined}
                              placeholder={tl(c.d.shipping_mode ? placePlaceholder(c.d.shipping_mode) : 'Port or airport, e.g. Dubai (Jebel Ali)')} onChange={(e) => updDest(c.d.key, { destination: e.target.value })} />
                          </Field>
                          <Field label="Incoterm" className="w-[110px]">
                            <Select value={c.d.incoterm} onChange={(e) => updDest(c.d.key, { incoterm: e.target.value as Incoterm })}>{INCOTERMS.filter((x) => x !== 'EXW').map((x) => <option key={x}>{x}</option>)}</Select>
                          </Field>
                          {canEdit && <Button type="button" variant="ghost" size="icon" aria-label={tl('Remove this destination')} data-tip={tl('Remove this destination')}
                            onClick={() => { setDests((ds) => ds.filter((x) => x.key !== c.d.key)); setDirty(true) }}><Trash2 /></Button>}
                        </div>
                      }
                      note={destTotals[i] != null && <p className="text-sm">{tl('Total for this destination:')} <b className="tabular-nums">{money(destTotals[i], form.currency)}</b></p>} />
                  ))}
                  {canEdit && (
                    <button type="button" onClick={addDest}
                      className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary sm:col-span-2 lg:col-span-3">
                      <Plus className="size-4" />{tl(multi ? 'Add another destination' : 'Price for another port or airport too')}
                    </button>
                  )}
                  {multi && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:col-span-2 lg:col-span-3">
                      <span className="text-xs font-medium text-muted-foreground">{tl('In the PDF:')}</span>
                      {(['columns', 'tables'] as const).map((v) => (
                        <label key={v} className="flex items-center gap-1.5">
                          <input type="radio" name="destinations_layout" className="size-4 accent-[#23856B]" checked={form.destinations_layout === v} onChange={() => upd({ destinations_layout: v })} />
                          {tl(v === 'columns' ? 'One table, a price column for each destination' : 'A separate table for each destination')}
                        </label>
                      ))}
                      {form.destinations_layout === 'columns' && dests.length > 3 && <span className="w-full text-xs text-amber-700 dark:text-amber-300">{tl('More than 4 destinations get narrow as columns — a table for each is easier to read.')}</span>}
                    </div>
                  )}
                </>}
                <Field label="Date"><Input type="date" value={form.issue_date} onChange={(e) => upd({ issue_date: e.target.value })} /></Field>
                <Field label="Valid for (days)" hint={n(form.validity_days) ? `until ${fmtDateDMY(addDays(form.issue_date, n(form.validity_days)!))}` : undefined}>
                  <Input inputMode="numeric" value={form.validity_days} onChange={(e) => {
                    const policyWasDefault = form.policy === policyFrom(base.settings, form)
                    upd({ validity_days: e.target.value, ...(policyWasDefault ? { policy: policyFrom(base.settings, { ...form, validity_days: e.target.value }) } : {}) })
                  }} />
                </Field>
                <Field label="Language" hint="Language of the printed quotation.">
                  <Select value={form.language} disabled={!base.v14} onChange={(e) => switchLanguage(e.target.value as QuoteLang)}>
                    <option value="en">English</option><option value="ar">العربية (Arabic)</option>
                  </Select>
                </Field>
                <Field label="Letterhead" className="sm:col-span-1 lg:col-span-2" hint="Which company the quotation is printed under.">
                  <Select value={form.brand} onChange={(e) => switchBrand(e.target.value as Brand)}>
                    {(Object.keys(BRANDS) as Brand[]).map((b) => <option key={b} value={b}>{BRANDS[b].label}</option>)}
                  </Select>
                </Field>
                <div className="sm:col-span-2 lg:col-span-3">
                  <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    <ChevronDown className={cn('size-4 transition-transform', !more && '-rotate-90 rtl:rotate-90')} />
                    {tl(more ? 'Fewer details' : 'More details')} <span className="font-normal text-muted-foreground">{tl('(email, phone, production time, payment terms)')}</span>
                  </button>
                </div>
                {more && <>
                <Field label="Email (not printed)"><Input type="email" value={form.customer_email} onChange={(e) => upd({ customer_email: e.target.value })} /></Field>
                <Field label="Phone / WhatsApp (not printed)"><Input value={form.customer_phone} onChange={(e) => upd({ customer_phone: e.target.value })} /></Field>
                <Field label="Production time"><Input value={form.production_time} onChange={(e) => {
                  const policyWasDefault = form.policy === policyFrom(base.settings, form)
                  upd({ production_time: e.target.value, ...(policyWasDefault ? { policy: policyFrom(base.settings, { ...form, production_time: e.target.value }) } : {}) })
                }} /></Field>
                <Field label="Payment terms (optional)"><Input placeholder="e.g. 50% advance, 50% before shipment" value={form.payment_terms} onChange={(e) => upd({ payment_terms: e.target.value })} /></Field>
                </>}
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle><Step n={2} />Products</CardTitle><CardDescription>{form.brand === 'prime_roots' ? 'Prime Roots letterhead: only jams are listed.' : 'MS El-brancy letterhead: jams are listed under Prime Roots.'} Description, packing and price fill in from Products and the price list. All editable.</CardDescription></div>
              {canEdit && <Button variant="outline" size="sm" onClick={addLine}><Plus />Add product</Button>}
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[#23856B]" checked={form.show_quantities} disabled={!canEdit} onChange={(e) => upd({ show_quantities: e.target.checked })} />
                Print quantity and total columns
              </label>
              {!lines.length && !canEdit && <Empty title="No products yet" />}
              {priced.map((l) => {
                const p = prod[l.product_id]
                return (
                  <div key={l.key} className="rounded-md border border-border p-3">
                    <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-12">
                      <Field label="Product" className="sm:col-span-4">
                        <div className="flex gap-1.5">
                          <div className="min-w-0 flex-1">
                            <Select id={`line-${l.key}-product`} value={l.product_id} onChange={(e) => {
                              if (e.target.value === '__new__') return setProdDlg({ key: l.key, product: null, name: l.product_id ? '' : l.description })
                              pickProduct(l.key, e.target.value)
                            }}>
                              <option value="">Choose… (or type below)</option>
                              {canManageCatalog && <option value="__new__">{tl('+ Add a new product…')}</option>}
                              {p && !forBrand(p) && <option value={p.id}>{p.name} (other letterhead)</option>}
                              {grouped.map(({ c, items }) => <optgroup key={c.id} label={c.name}>{items.map((x) => <option key={x.id} value={x.id}>{x.name_ar ? `${x.name} · ${x.name_ar}` : x.name}</option>)}</optgroup>)}
                            </Select>
                          </div>
                          {canManageCatalog && p && (
                            <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label={tl('Edit this product')} data-tip={tl('Edit this product')}
                              onClick={() => setProdDlg({ key: l.key, product: p })}><Pencil /></Button>
                          )}
                        </div>
                      </Field>
                      {p && p.varieties.length > 0 && (
                        <Field label="Variety" className="sm:col-span-3">
                          <Select value={l.variety ?? ''} onChange={(e) => pickProduct(l.key, l.product_id, undefined, e.target.value)}>
                            <option value="">Any / not specified</option>
                            {p.varieties.map((v) => <option key={v} value={v}>{v}</option>)}
                          </Select>
                        </Field>
                      )}
                      <Field label="Printed description" className={p && p.varieties.length > 0 ? 'sm:col-span-5' : 'sm:col-span-5'}><Input dir="auto" value={l.description} onChange={(e) => updLine(l.key, { description: e.target.value })} placeholder="e.g. Dragon Fruit — Red/White" /></Field>
                      <Field label="Product type" className="sm:col-span-3"><Input dir="auto" value={l.product_type_label} onChange={(e) => updLine(l.key, { product_type_label: e.target.value })} /></Field>
                      <Field label="Packing" className="sm:col-span-4">
                        {p && packsFor(p, l.variety).length > 0 ? (
                          <Select value={l.packaging_id} onChange={(e) => pickProduct(l.key, l.product_id, e.target.value)}>
                            {packsFor(p, l.variety).map((pk) => <option key={pk.id} value={pk.id}>{packOptionLabel(pk)}</option>)}
                          </Select>
                        ) : (
                          <>
                            <Input value={l.packing} placeholder="e.g. 10 kg carton" onChange={(e) => {
                              // the weight follows what is typed ("3 kg"), unless it was typed by hand
                              const auto = kgFromPacking(e.target.value)
                              const wasAuto = !l.netManual && (!l.net.trim() || n(l.net) === kgFromPacking(l.packing))
                              updLine(l.key, { packing: e.target.value, ...(wasAuto ? { net: auto != null ? String(auto) : '' } : {}) })
                            }} />
                            <div className="mt-1 flex items-center gap-1.5">
                              <Input id={`line-${l.key}-net`} inputMode="decimal" value={l.net} placeholder={String(kgFromPacking(l.packing) ?? "?")} aria-label={tl("Net kg per carton")}
                                onChange={(e) => updLine(l.key, { net: e.target.value, netManual: e.target.value.trim() !== '' })}
                                className={cn('h-8 w-20 text-sm', !netOf(l) && (l.basis === 'unit' || l.quantity_unit !== 'tons') && 'border-amber-400')} />
                              <span className="whitespace-nowrap text-xs text-muted-foreground"><T>kg net in one carton</T></span>
                            </div>
                          </>
                        )}
                        {p && activePackaging(p).length > 0 && form.language === 'ar' && (
                          <Input className="mt-1" dir="rtl" lang="ar" aria-label="Printed packing" placeholder="Printed packing (Arabic)" value={l.packing} onChange={(e) => updLine(l.key, { packing: e.target.value })} />
                        )}
                      </Field>
                      {isJam(l) ? (
                      <Field label="Quantity (optional)" className="sm:col-span-5">
                        <div className="flex items-center gap-1">
                          <Input inputMode="decimal" value={l.quantity} onChange={(e) => updLine(l.key, { quantity: e.target.value })} />
                          <span className="w-[100px] shrink-0 text-sm text-muted-foreground">{l.sell === 'shrink' ? 'shrinks' : 'jars'}</span>
                        </div>
                      </Field>
                      ) : (
                      <Field label="Quantity (optional)" className="sm:col-span-5">
                        <div className="flex gap-1">
                          <Input inputMode="decimal" value={l.quantity} onChange={(e) => updLine(l.key, { quantity: e.target.value })} />
                          <Select value={l.quantity_unit} onChange={(e) => updLine(l.key, { quantity_unit: e.target.value as QuoteQtyUnit })} className="w-[100px]" aria-label="Unit">
                            <option value="tons">tons</option><option value="cartons">cartons</option><option value="pallets">pallets</option>
                            {(l.basis === 'ton' || l.basis === 'unit') && <option value="units">{unitsLabel(l.unit_label)}</option>}
                          </Select>
                        </div>
                      </Field>
                      )}
                      <div className="flex items-end justify-between gap-2 sm:col-span-3">
                        <div className="pb-2 text-sm"><span className="text-xs text-muted-foreground">{tl('Total')} </span><b className="tabular-nums">{money(l.total, form.currency)}</b></div>
                        {canEdit && <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); setDirty(true) }}><Trash2 /></Button>}
                      </div>
                      {isJam(l) && (
                        <div className="grid gap-3 sm:col-span-12 sm:grid-cols-3">
                          <Field label="Sell by">
                            <Select value={l.sell ?? 'jar'} onChange={(e) => updLine(l.key, { sell: e.target.value as 'jar' | 'shrink', per_shrink: l.per_shrink || JARS_PER_SHRINK })}>
                              <option value="jar">Jar</option><option value="shrink">Shrink (pack of jars)</option>
                            </Select>
                          </Field>
                          {l.sell === 'shrink' && (
                            <Field label="Jars in one shrink">
                              <Input inputMode="numeric" value={l.per_shrink ?? ''} placeholder="e.g. 12" onChange={(e) => {
                                const v = e.target.value
                                // same shrink size for every jam line of this quotation
                                setLines((ls) => ls.map((x) => (x.key === l.key || (prod[x.product_id]?.product_type === 'jam' && x.sell === 'shrink') ? { ...x, per_shrink: v } : x))); setDirty(true)
                              }} />
                            </Field>
                          )}
                          <div className="flex items-end pb-2 text-sm text-muted-foreground">
                            {l.sell === 'shrink'
                              ? (l.unitFinal ? <span>{tl('Price per shrink:')} <b className="text-foreground tabular-nums">{money(l.unitFinal, form.currency)}</b> ({l.k} × {money(l.jarFinal, form.currency)})</span> : <span>{tl('Enter the jars per shrink and the jar price.')}</span>)
                              : l.jarFinal ? <span>{tl('Price per jar:')} <b className="text-foreground tabular-nums">{money(l.jarFinal, form.currency)}</b></span> : null}
                          </div>
                        </div>
                      )}
                      <Field label={isJam(l) ? 'Price per jar' : 'Price'} hint={l.priceNote} className="sm:col-span-12">
                        <div className="flex gap-1">
                          {l.basis !== 'ton'
                            ? <Input inputMode="decimal" aria-label="Price" value={l.unit_price} onChange={(e) => updLine(l.key, { unit_price: e.target.value, price_id: null, priceNote: 'Entered manually' })} />
                            : <Input inputMode="decimal" aria-label="Price" value={l.price} onChange={(e) => updLine(l.key, { price: e.target.value, price_id: null, priceNote: 'Entered manually' })} />}
                          <Select value={l.in_ccy} aria-label="Currency of this price" className="w-[84px] shrink-0"
                            onChange={(e) => updLine(l.key, { in_ccy: e.target.value, fx: '', fxNote: '' })}>
                            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                          </Select>
                        </div>
                        {!isJam(l) && (() => {
                          const packWord = l.unit_label || packLabel(p ? activePackaging(p).find((x) => x.id === l.packaging_id) : null)
                          const opts: [PriceBasis, string][] = [['ton', 'ton'], ['kg', 'kg'], ['unit', packWord], ['pallet', 'pallet']]
                          const net = netOf(l), cpp = n(l.cpp)
                          /** Switch the unit and write the same price for it (1,250 / ton → 1.25 / kg). */
                          const switchTo = (b: PriceBasis) => {
                            if (b === l.basis) return
                            const typed = l.basis === 'ton' ? n(l.price) : n(l.unit_price)
                            const v = typed != null ? convertBasis(typed, l.basis, b, net, cpp) : null
                            const val = v == null ? '' : String(Math.round(v * (b === 'kg' ? 1e4 : 100)) / (b === 'kg' ? 1e4 : 100))
                            const qty = (b === 'kg' || b === 'pallet') && l.quantity_unit === 'units' ? { quantity_unit: (b === 'pallet' ? 'pallets' : 'tons') as QuoteQtyUnit } : {}
                            updLine(l.key, { basis: b, ...(b === 'ton' ? { price: val } : { unit_price: val }), ...(b === 'unit' ? { unit_label: packWord } : {}), ...qty })
                            if (typed != null && v == null) toast.message(tl('Fill the kg per carton (and cartons per pallet) to convert the price.'))
                          }
                          const conv = l.tonFinal ? opts.map(([b, w]) => ({ b, w, v: convertBasis(l.tonFinal!, 'ton', b, net, cpp) })) : []
                          return (
                            <div className="mt-1.5 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">{tl('Price per')}</span>
                                <div role="radiogroup" aria-label={tl('Price per')} className="inline-flex rounded-lg bg-muted p-0.5">
                                  {opts.map(([b, w]) => {
                                    const ok = basisPerTon(b, net, cpp) != null
                                    return (
                                      <button key={b} type="button" role="radio" aria-checked={l.basis === b} onClick={() => switchTo(b)}
                                        data-tip={!ok ? tl(b === 'pallet' ? 'Needs kg per carton and cartons per pallet' : 'Needs the kg per carton') : undefined}
                                        className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', l.basis === b ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground', !ok && l.basis !== b && 'opacity-50')}>
                                        {tl(w)}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                              {conv.length > 0 && (
                                <p className="text-xs text-muted-foreground" dir="ltr">
                                  = {conv.filter((c) => c.v != null).map((c, i) => <span key={c.b}>{i ? ' · ' : ''}<b className={cn('tabular-nums', c.b === l.basis ? 'text-foreground' : '')}>{money(c.v, undefined, c.b === 'kg' ? 3 : 2)}</b> / {tl(c.w)}</span>)} <span>{form.currency}</span>
                                </p>
                              )}
                            </div>
                          )
                        })()}
                        {l.fpt > 0 && l.tonSave != null && (
                          <p className="mt-1 text-xs text-primary" dir="auto">
                            {tl('+ freight {f} / ton → printed price {p} / ton', { f: money(l.fpt, form.currency), p: money(l.tonSave, form.currency) })}
                          </p>
                        )}
                        {l.in_ccy !== form.currency && (
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            {l.fxr ? (
                              <span>= <b className="text-foreground">{money(isJam(l) ? l.jarFinal : l.basis !== 'ton' ? l.unitFinal : l.tonFinal, form.currency)}</b> {isJam(l) ? 'per jar' : l.basis === 'unit' ? `per ${l.unit_label}` : l.basis === 'kg' ? 'per kg' : l.basis === 'pallet' ? 'per pallet' : 'per ton'} · 1 {l.in_ccy} = {+l.fxr.rate.toPrecision(6)} {form.currency} <span className="opacity-80">({l.fx ? (l.fxNote || 'typed') : `${l.fxr.source}, ${new Date(l.fxr.rate_at).toLocaleDateString('en-GB')}`})</span></span>
                            ) : <span className="text-destructive">No saved rate {l.in_ccy}→{form.currency}.</span>}
                            <label className="flex items-center gap-1">rate
                              <Input inputMode="decimal" className="h-7 w-24 text-xs" placeholder={l.fxr ? String(+l.fxr.rate.toPrecision(6)) : `1 ${l.in_ccy} = ?`} value={l.fx}
                                onChange={(e) => updLine(l.key, { fx: e.target.value, fxNote: e.target.value ? 'typed by you' : '' })} aria-label={`Rate 1 ${l.in_ccy} in ${form.currency}`} />
                            </label>
                          </div>
                        )}
                      </Field>
                    </fieldset>
                  </div>
                )
              })}
              {canEdit && (
                <button type="button" onClick={addLine}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Plus className="size-4" />{tl(form.brand === 'prime_roots' ? (lines.length ? 'Add another jam' : 'Add a jam') : (lines.length ? 'Add another product' : 'Add a product'))}
                </button>
              )}
              {lines.length > 0 && (
                <div className="flex flex-wrap items-baseline justify-end gap-x-2 text-sm">
                  {freightLine != null && goods != null && <span className="text-muted-foreground tabular-nums">{tl('Products')} {money(goods, form.currency)} + {tl('Freight')} {money(freightLine, form.currency)} =</span>}
                  <span>{multi && form.destination.trim() ? `${form.destination.trim()} · ` : ''}{tl('Total:')} <b className="ms-1 tabular-nums">{grand != null ? money(grand, form.currency) : tl('enter all quantities to see the total')}</b></span>
                  {multi && destCalc.map((c, i) => destTotals[i] != null && <span key={c.d.key} className="w-full text-end">{c.d.destination.trim() || tl('Destination {n}', { n: i + 2 })} · {tl('Total:')} <b className="ms-1 tabular-nums">{money(destTotals[i], form.currency)}</b></span>)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle><Step n={3} />Our Policy</CardTitle><CardDescription>One line per point; start a line with “## ” for a heading. Defaults come from Company Settings.</CardDescription></div>
              {canEdit && <Button variant="ghost" size="icon" title="Reset to defaults" aria-label="Reset to defaults" onClick={() => upd({ policy: policyFrom(base.settings, form) })}><RotateCcw /></Button>}
            </CardHeader>
            <CardContent><Textarea dir={form.language === 'ar' ? 'rtl' : 'ltr'} className="min-h-[170px] text-sm" disabled={!canEdit} value={form.policy} onChange={(e) => upd({ policy: e.target.value })} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Internal notes</CardTitle><CardDescription>Never printed.</CardDescription></CardHeader>
            <CardContent><Textarea disabled={!canEdit} value={form.notes} onChange={(e) => upd({ notes: e.target.value })} /></CardContent>
          </Card>
          {quote && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" />Sent versions</CardTitle><CardDescription>Saved exactly as they were sent.</CardDescription></CardHeader>
              <CardContent>
                {!versions.length ? <p className="text-sm text-muted-foreground">{tl('Not sent yet.')}</p> : (
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
      {base && prodDlg && (
        <ProductDialog open={!!prodDlg} onOpenChange={(o) => { if (!o) setProdDlg(null) }} product={prodDlg.product} categories={base.categories}
          canEdit={canManageCatalog} onSaved={productSaved} initialName={prodDlg.name} initialType={form?.brand === 'prime_roots' ? 'jam' : undefined} />
      )}
      {quote && form && destPick && (
        <Dialog open onOpenChange={(o) => { if (!o) setDestPick(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{tl('Which destination did the buyer choose?')}</DialogTitle><DialogDescription>{tl('The proforma is made with that destination’s prices and shipping.')}</DialogDescription></DialogHeader>
            <DialogBody className="grid gap-2">
              {[{ id: '', label: [quote.incoterm, quote.destination].filter(Boolean).join(' ') || tl('Destination {n}', { n: 1 }) },
                ...(quote.quotation_destinations ?? []).map((d) => ({ id: d.id ?? '', label: [d.incoterm, d.destination].filter(Boolean).join(' ') }))].map((o) => (
                <Button key={o.id || 'main'} variant="outline" className="justify-start" onClick={() => nav(`/proformas/new?quotation=${destPick}${o.id ? `&dest=${o.id}` : ''}`)}>{o.label}</Button>
              ))}
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
      {quote && form && <SendDialog open={sendOpen} onOpenChange={setSendOpen} email={form.customer_email} phone={form.customer_phone}
        doc={{ kind: 'quotation', number: quote.number, version: quote.version, lang: form.language, contactName: form.customer_name || null, company: form.customer_company,
          validUntil: quote.valid_until, sender: profile?.full_name, brandName: form.brand === 'prime_roots' ? 'Prime Roots' : 'MS El-brancy Group' }}
        onPdf={() => printIt()} onMarkSent={canWrite && editableStatus ? () => setStatus('sent', true) : undefined} />}
      {canEdit && (
        <StickyActions dirty={dirty} info={<span className="text-muted-foreground">{tl(lines.length === 1 ? '1 product' : '{n} products', { n: lines.length })} · {tl('Total')} <b className="text-foreground tabular-nums">{grand != null ? money(grand, form.currency) : '—'}</b></span>}>
          <Button variant="outline" onClick={() => printIt()} disabled={!!busy || (isNew && !lines.length)}><Printer />Preview / PDF</Button>
          <Button onClick={save} disabled={!!busy} title="Ctrl + S">{busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />}Save</Button>
        </StickyActions>
      )}
    </>
  )
}

type FreightCalc = ReturnType<typeof quoteFreight>
/** Shipping method and freight cost of the quotation. */
type ShipFields = Pick<Form, 'destination' | 'incoterm' | 'currency' | 'shipping_mode' | 'freight_basis' | 'freight_rate' | 'freight_currency' | 'freight_fx' | 'freight_containers' | 'shipping_rate_id' | 'freight_display'>
/** The same deal for any mode: FOB → FCA, CFR → CPT, CIF → CIP. */
const SEA_TO_ANY = { FOB: 'FCA', CFR: 'CPT', CIF: 'CIP' } as const
function ShippingBox({ form, upd, freight, freightFx, freightOn, rates, canAddRates, totalNetKg, idp = '', showDisplay = true, title, header, note, onIncoterm }: {
  form: ShipFields; upd: (p: Partial<ShipFields>) => void; freight: FreightCalc; freightFx: { rate: number; source: string; rate_at: string } | null
  freightOn: boolean; rates: SavedRate[]; canAddRates: boolean; totalNetKg: number | null
  /** for several boxes on one page: unique element ids */ idp?: string
  showDisplay?: boolean; title?: string; header?: React.ReactNode; note?: React.ReactNode
  /** switch to the any-mode twin of a sea term (CIF → CIP) */ onIncoterm?: (i: Incoterm) => void
}) {
  const { t } = useT()
  const mode = form.shipping_mode || null
  const saved = mode ? ratesFor(rates, mode, form.destination) : []
  const bases = mode ? basesFor(mode) : []
  const setMode = (m: ShipMode) => upd({ shipping_mode: m, shipping_rate_id: '', ...(bases.length && basesFor(m).includes(form.freight_basis) ? {} : { freight_basis: defaultBasis(m) }) })
  const pickRate = (id: string) => {
    const r = rates.find((x) => x.id === id); const f = r && freightFromRate(r)
    if (!r || !f) return upd({ shipping_rate_id: '' })
    upd({ shipping_rate_id: id, shipping_mode: modeOfRate(r.mode), freight_basis: f.basis, freight_rate: String(f.rate), freight_currency: f.currency, freight_fx: '',
      ...(f.basis === 'per_container' && !form.freight_containers ? { freight_containers: '1' } : {}) })
  }
  const rateLabel = (r: SavedRate) => {
    const f = freightFromRate(r)!
    return `${r.destination_port ? `${r.destination_port}, ` : ''}${r.destination_country}${r.container_type ? ` · ${r.container_type}` : ''}${r.carrier ? ` · ${r.carrier}` : ''} — ${money(f.rate, f.currency, f.basis === 'per_kg' ? 3 : 2)} ${t(BASIS_LABEL[f.basis])}`
  }
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2 lg:col-span-3">
      {header}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium">{title ?? t('Shipping')}</span>
        <div role="radiogroup" aria-label={t('Shipping')} className="inline-flex rounded-lg bg-muted p-0.5">
          {SHIP_MODES.map((m) => {
            const Icon = MODE_ICON[m]
            return (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', mode === m ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="size-4" />{t(SHIP_MODE_LABEL[m])}
              </button>
            )
          })}
        </div>
        {!mode && <span className="text-xs text-muted-foreground"><T>Choose how it ships.</T></span>}
      </div>
      {mode && mode !== 'sea' && seaOnlyTerm(form.incoterm) && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-amber-700 dark:text-amber-300">{t('{i} is a sea term. For air or land, CPT or CIP is the usual choice.', { i: form.incoterm })}
          {onIncoterm && <button type="button" className="font-medium underline underline-offset-2" onClick={() => onIncoterm(SEA_TO_ANY[form.incoterm as 'FOB' | 'CFR' | 'CIF'])}>{t('Use {i}', { i: SEA_TO_ANY[form.incoterm as 'FOB' | 'CFR' | 'CIF'] })}</button>}
        </p>
      )}
      {mode && !freightOn && (
        <p className="text-xs text-muted-foreground">{t('Under {i} the buyer pays the freight, so only the shipping method is printed.', { i: form.incoterm })}</p>
      )}
      {freightOn && mode && (
        <>
          {saved.length > 0 ? (
            <Field label="Use a saved rate" hint="From Shipping & Logistics. The ones for this destination come first.">
              <Select value={form.shipping_rate_id} onChange={(e) => pickRate(e.target.value)}>
                <option value="">{t('— Type the freight yourself —')}</option>
                {saved.map((r) => <option key={r.id} value={r.id}>{rateLabel(r)}</option>)}
              </Select>
            </Field>
          ) : canAddRates && (
            <p className="text-xs text-muted-foreground"><T>Tip: save your forwarders’ rates in Shipping & Logistics and pick them here next time.</T></p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Freight cost" className="min-w-[200px] flex-1">
              <div className="flex gap-1">
                <Input id={`${idp}freight-rate`} inputMode="decimal" value={form.freight_rate} placeholder="0" onChange={(e) => upd({ freight_rate: e.target.value, shipping_rate_id: '' })} />
                <Select value={form.freight_currency} aria-label={t('Currency')} className="w-[84px] shrink-0" onChange={(e) => upd({ freight_currency: e.target.value, freight_fx: '', shipping_rate_id: '' })}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </div>
            </Field>
            <div role="radiogroup" aria-label={t('Freight is')} className="mb-0.5 inline-flex h-10 items-center rounded-lg bg-muted p-0.5">
              {bases.map((b) => (
                <button key={b} type="button" role="radio" aria-checked={form.freight_basis === b} onClick={() => upd({ freight_basis: b, shipping_rate_id: '', ...(b === 'per_container' && !form.freight_containers ? { freight_containers: '1' } : {}) })}
                  className={cn('h-full rounded-md px-3 text-xs font-medium transition-colors', form.freight_basis === b ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {t(BASIS_LABEL[b])}
                </button>
              ))}
            </div>
            {form.freight_basis === 'per_container' && (
              <Field label={mode === 'land' ? 'Trucks / containers' : 'Containers'} className="w-[130px]">
                <Input id={`${idp}freight-containers`} inputMode="numeric" value={form.freight_containers} onChange={(e) => upd({ freight_containers: e.target.value })} />
              </Field>
            )}
          </div>
          {form.freight_currency !== form.currency && n(form.freight_rate) != null && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {freightFx ? <span>1 {form.freight_currency} = {+freightFx.rate.toPrecision(6)} {form.currency} <span className="opacity-80">({form.freight_fx ? t('typed by you') : freightFx.source})</span></span>
                : <span className="text-destructive">{t('No saved rate {a}→{b}.', { a: form.freight_currency, b: form.currency })}</span>}
              <label className="flex items-center gap-1"><T>rate</T>
                <Input inputMode="decimal" className="h-7 w-24 text-xs" placeholder={`1 ${form.freight_currency} = ?`} value={form.freight_fx} onChange={(e) => upd({ freight_fx: e.target.value })} aria-label={t('Exchange rate')} />
              </label>
            </div>
          )}
          {mode === 'air' && form.freight_basis === 'per_kg' && (
            <p className="text-xs text-muted-foreground"><T>Worked out on the net weight. Airlines charge the gross (or volume) weight — if you know the final amount, choose “total”.</T></p>
          )}
          {showDisplay && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground"><T>On the quotation:</T></span>
            {(['line', 'in_prices'] as const).map((d) => (
              <label key={d} className="flex items-center gap-1.5">
                <input type="radio" name="freight_display" className="size-4 accent-[#23856B]" checked={form.freight_display === d} onChange={() => upd({ freight_display: d })} />
                <T>{d === 'line' ? 'Separate freight line' : 'Inside the product prices'}</T>
              </label>
            ))}
          </div>}
          {note}
          {n(form.freight_rate) != null && (
            <p className="rounded-md bg-card px-3 py-2 text-sm" role="status">
              {freight.total != null || freight.perTon != null ? (
                <>
                  <T>Freight</T>:{' '}
                  {freight.total != null && <b className="tabular-nums" dir="ltr">{money(freight.total, form.currency)}</b>}
                  {freight.total != null && freight.perTon != null && ' · '}
                  {freight.perTon != null && <span className="tabular-nums" dir="ltr">{money(freight.perTon, form.currency)} / {t('ton')}</span>}
                  {totalNetKg != null && <span className="text-muted-foreground"> · {t('{n} t net', { n: +(totalNetKg / 1000).toFixed(3) })}</span>}
                </>
              ) : null}
              {freight.missing && <span className="block text-xs text-muted-foreground">{t(freight.missing)}</span>}
            </p>
          )}
        </>
      )}
    </div>
  )
}
