import { supabase } from './supabase'
import type { Incoterm } from './pricing'
import type { QtyUnit } from './planner'

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'revised'
export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft', sent: 'Sent', accepted: 'Accepted', rejected: 'Rejected', expired: 'Expired', revised: 'Revised (editing)',
}
export const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  revised: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  sent: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  rejected: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
  expired: 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
}

/** Quotation quantities can also be counted in units (jars, bunches…). */
export type QuoteQtyUnit = QtyUnit | 'units'
/** How a line is priced: per ton, per carton/jar/pack ('unit'), per kg or per pallet (kg + pallet from migration 0021). */
export type PriceBasis = 'ton' | 'unit' | 'kg' | 'pallet'

export type QuoteItem = {
  id?: string; quotation_id?: string; product_id: string | null; packaging_id: string | null
  description: string; packing: string | null; product_type_label: string | null
  quantity: number | null; quantity_unit: QuoteQtyUnit | null; net_weight_kg: number | null; cartons_per_pallet: number | null
  price_per_ton: number; line_total: number | null; price_id: string | null; sort_order: number
  // added in 0013 (missing on older rows / before the migration)
  price_basis?: PriceBasis | null; unit_price?: number | null; unit_label?: string | null
}

/** Letterheads a quotation can be printed on. */
export type Brand = 'ms_elbrancy' | 'prime_roots'
export const BRANDS: Record<Brand, { label: string; name: string; slogan: string; letterhead: string; primary: string; heading: string }> = {
  ms_elbrancy: { label: 'MS El-brancy Group', name: '', slogan: '', letterhead: 'letterhead.jpg', primary: '#145a3c', heading: '#176b4b' },
  prime_roots: { label: 'Prime Roots (jams)', name: 'Prime Roots', slogan: 'Premium Tropical Jams', letterhead: 'letterhead-primeroots.jpg', primary: '#0f3d22', heading: '#c97f06' },
}
export type Quotation = {
  id: string; number: string; status: QuoteStatus; version: number; issue_date: string
  validity_days: number | null; valid_until: string | null
  customer_name: string | null; customer_company: string | null; customer_country: string | null
  customer_email: string | null; customer_phone: string | null; destination: string | null
  incoterm: Incoterm | null; currency: string; payment_terms: string | null; production_time: string | null
  policy_lines: string[]; show_quantities: boolean; plan_id: string | null; notes: string | null
  sent_at: string | null; created_at: string; created_by: string; updated_at: string
  brand?: Brand | null
  quotation_items?: QuoteItem[]
}
export type QuoteVersion = { id: number; quotation_id: string; version: number; status: QuoteStatus; snapshot: Quotation & { items: QuoteItem[] }; created_at: string }

export async function fetchQuotations() {
  const { data, error } = await supabase.from('quotations').select('*, quotation_items(line_total)').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as (Quotation & { quotation_items: { line_total: number | null }[] })[]
}
export async function fetchQuotation(id: string) {
  const [q, v] = await Promise.all([
    supabase.from('quotations').select('*, quotation_items(*)').eq('id', id).single(),
    supabase.from('quotation_versions').select('*').eq('quotation_id', id).order('version', { ascending: false }),
  ])
  if (q.error) throw q.error
  if (v.error) throw v.error
  const quote = q.data as Quotation
  quote.quotation_items = (quote.quotation_items ?? []).sort((a, b) => a.sort_order - b.sort_order)
  return { quote, versions: (v.data ?? []) as QuoteVersion[] }
}

/** Net tons for a line, from its quantity and unit. For 'units' and 'cartons', net_weight_kg is the weight of one. */
export function lineTons(i: Pick<QuoteItem, 'quantity' | 'quantity_unit' | 'net_weight_kg' | 'cartons_per_pallet'>): number | null {
  if (!i.quantity || !i.quantity_unit) return null
  if (i.quantity_unit === 'tons') return i.quantity
  if (!i.net_weight_kg) return null
  if (i.quantity_unit === 'cartons' || i.quantity_unit === 'units') return (i.quantity * i.net_weight_kg) / 1000
  if (!i.cartons_per_pallet) return null
  return (i.quantity * i.cartons_per_pallet * i.net_weight_kg) / 1000
}
export function lineTotal(i: Parameters<typeof lineTons>[0] & { price_per_ton: number | null; price_basis?: PriceBasis | null; unit_price?: number | null }) {
  if (i.price_basis === 'kg') {
    const t = lineTons(i)
    return t != null && i.unit_price ? Math.round(t * 1000 * i.unit_price * 100) / 100 : null
  }
  if (i.price_basis === 'pallet') {
    if (!i.unit_price || !i.quantity || !i.quantity_unit) return null
    if (i.quantity_unit === 'pallets') return Math.round(i.quantity * i.unit_price * 100) / 100
    const t = lineTons(i)
    return t != null && i.net_weight_kg && i.cartons_per_pallet ? Math.round(((t * 1000) / (i.net_weight_kg * i.cartons_per_pallet)) * i.unit_price * 100) / 100 : null
  }
  if (i.price_basis === 'unit') {
    // Price per unit: count the units (exact when the quantity is already in units).
    if (!i.unit_price || !i.quantity || !i.quantity_unit) return null
    let units: number | null = null
    if (i.quantity_unit === 'units') units = i.quantity
    else { const t = lineTons(i); if (t != null && i.net_weight_kg) units = Math.round((t * 1000) / i.net_weight_kg) }
    return units != null ? Math.round(units * i.unit_price * 100) / 100 : null
  }
  const t = lineTons(i)
  return t != null && i.price_per_ton ? Math.round(t * i.price_per_ton * 100) / 100 : null
}
/** Per-ton equivalent of a unit price (unit weighs net_weight_kg). */
export const unitToTon = (unitPrice: number, netKg: number) => Math.round((unitPrice / netKg) * 1000 * 100) / 100
/** Plural label for units, e.g. jar → jars. */
export const unitsLabel = (label: string | null | undefined, n = 2) => {
  const l = (label || 'unit').trim()
  if (/^(kg|g|t|ton)$/i.test(l)) return l === 'ton' && n !== 1 ? 'tons' : l
  return n === 1 || /s$/i.test(l) ? l : l.replace(/(ch|sh|x)$/i, '$1e') + 's'
}

/** Fills {validity_days}, {incoterm}, {production_time} in the policy templates. */
export function renderPolicy(templates: string[], v: { validity_days: number | null; incoterm: string | null; production_time: string | null; currency?: string | null }) {
  return templates.map((t) => t
    .replace(/\{currency\}/g, v.currency ?? '…')
    .replace(/\{validity_days\}/g, v.validity_days ? String(v.validity_days) : '…')
    .replace(/\{incoterm\}/g, v.incoterm ?? '…')
    .replace(/\{production_time\}/g, v.production_time ?? '…'))
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10)
}
export const fmtDateDMY = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
export function fmtPrice(v: number | null | undefined, ccy: string) {
  if (v == null) return '—'
  const n = Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  const sym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' }
  return sym[ccy] ? `${n}${sym[ccy]}` : `${n} ${ccy}`
}

// ---------------------------------------------------------------------
// Language of the printed quotation
// ---------------------------------------------------------------------
export type QuoteLang = 'en' | 'ar'
export const QUOTE_TEXT = {
  en: {
    date: 'Date', ref: 'Ref', rev: 'rev.', title: 'Quotation', to: 'To', greeting: 'After greeting…',
    honored: (name: string) => [name, ' Company is honored to offer a price for the following items at hopeful price.'] as const,
    description: 'Product Description', packing: 'Packing', type: 'Product type', quantity: 'Quantity',
    price: 'Price', pricePerTon: 'Price/Ton', total: 'Total', policy: 'Our Policy is:', payment: 'Payment terms',
    signature: 'Authorized signature', continued: 'continued', ton: 'ton', tons: 't',
  },
  ar: {
    date: 'التاريخ', ref: 'رقم المرجع', rev: 'مراجعة', title: 'عرض سعر', to: 'إلى السادة', greeting: 'بعد التحية،',
    honored: (name: string) => ['تتشرف شركة ', name, ' بتقديم عرض السعر التالي:'] as const,
    description: 'وصف المنتج', packing: 'التعبئة', type: 'نوع المنتج', quantity: 'الكمية',
    price: 'السعر', pricePerTon: 'السعر / طن', total: 'الإجمالي', policy: 'سياستنا:', payment: 'شروط الدفع',
    signature: 'التوقيع المعتمد', continued: 'تابع', ton: 'طن', tons: 'طن',
  },
} as const

export const PRODUCT_TYPE_LABEL_AR = { fresh: 'طازج', frozen: 'مجمد', jam: 'مربى' } as const
const PACK_AR: Record<string, [string, string]> = {
  jar: ['برطمان', 'برطمان'], shrink: ['شرينك', 'شرينك'], carton: ['كرتونة', 'كرتونة'], basket: ['سبت', 'سبت'], crate: ['صندوق بلاستيك', 'صندوق بلاستيك'],
  tray: ['صينية', 'صينية'], kg: ['كجم', 'كجم'], pallet: ['بالتة', 'بالتة'], ton: ['طن', 'طن'], bag: ['شوال', 'شوال'], box: ['صندوق', 'صندوق'], bunch: ['حزمة', 'حزمة'], punnet: ['علبة', 'علبة'], unit: ['وحدة', 'وحدة'],
}
/** Unit name as printed, e.g. jar → "jars" (en) or "برطمان" (ar). */
export function unitWord(label: string | null | undefined, lang: QuoteLang, n = 2) {
  if (lang === 'en') return unitsLabel(label, n)
  const k = (label || 'unit').trim().toLowerCase().replace(/s$/, '')
  return PACK_AR[k]?.[n === 1 ? 0 : 1] ?? label ?? 'وحدة'
}

/** What one "pack" of this packaging is called, for prices per pack: jar, carton, basket… */
export function packLabel(pk: { packaging_type?: string | null; label?: string | null; units_per_pack?: number | null; unit_name?: string | null } | null | undefined) {
  if (!pk) return 'carton'
  if (pk.unit_name && (pk.units_per_pack ?? 1) === 1) return pk.unit_name.toLowerCase()
  const t = `${pk.packaging_type ?? ''} ${pk.label ?? ''}`.toLowerCase()
  for (const w of ['jar', 'basket', 'crate', 'tray', 'bag', 'box']) if (t.includes(w)) return w
  return 'carton'
}

/** Policy lines → sections. A line starting with "## " is a heading; no headings = one untitled section. */
export function policySections(lines: string[]): { title: string | null; items: string[] }[] {
  const out: { title: string | null; items: string[] }[] = []
  for (const raw of lines) {
    const l = raw.trim()
    if (!l) continue
    if (l.startsWith('## ')) out.push({ title: l.slice(3).trim(), items: [] })
    else { if (!out.length) out.push({ title: null, items: [] }); out[out.length - 1].items.push(l) }
  }
  return out
}

/**
 * Net kg of one carton / pack read from what was typed in Packing:
 * "3 Kg" → 3, "10kg carton" → 10, "10 x 1 kg" → 10, "12×500 g" → 6, "500 gm" → 0.5,
 * "4.5 كجم" / "٣ كيلو" → 4.5 / 3. Nothing that looks like a weight → null.
 */
export function kgFromPacking(text: string | null | undefined): number | null {
  if (!text) return null
  const s = text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[٫,]/g, '.').toLowerCase()
  const KG = '(?:kgs?|kilos?|kilograms?|كجم|كج|كيلو(?:جرام)?|ك\\.ج)'
  const G = '(?:g|gr|grs|gm|gms|grams?|جم|جرام)'
  const multi = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*[x×*]\\s*(\\d+(?:\\.\\d+)?)\\s*(${KG}|${G})(?![a-z])`).exec(s)
  if (multi) { const v = +multi[1] * +multi[2]; return round4(new RegExp(`^${G}$`).test(multi[3]) ? v / 1000 : v) }
  const kg = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${KG}(?![a-z])`).exec(s)
  if (kg) return +kg[1] > 0 ? round4(+kg[1]) : null
  const g = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${G}(?![a-z])`).exec(s)
  if (g) return +g[1] > 0 ? round4(+g[1] / 1000) : null
  return null
}
const round4 = (v: number) => Math.round(v * 1e4) / 1e4

/** How many of this price unit make one ton: ton 1, kg 1000, carton 1000 ÷ kg, pallet 1000 ÷ (kg × cartons). Null if the packing is unknown. */
export function basisPerTon(basis: PriceBasis, netKg: number | null, cartonsPerPallet: number | null): number | null {
  if (basis === 'ton') return 1
  if (basis === 'kg') return 1000
  if (!netKg || netKg <= 0) return null
  if (basis === 'unit') return 1000 / netKg
  return cartonsPerPallet && cartonsPerPallet > 0 ? 1000 / (netKg * cartonsPerPallet) : null
}
/** Same price written for another unit (e.g. 1,250 per ton → 1.25 per kg). */
export function convertBasis(value: number, from: PriceBasis, to: PriceBasis, netKg: number | null, cpp: number | null): number | null {
  const a = basisPerTon(from, netKg, cpp), b = basisPerTon(to, netKg, cpp)
  return a == null || b == null ? null : (value * a) / b
}
