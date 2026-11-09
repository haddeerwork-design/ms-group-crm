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

export type QuoteItem = {
  id?: string; quotation_id?: string; product_id: string | null; packaging_id: string | null
  description: string; packing: string | null; product_type_label: string | null
  quantity: number | null; quantity_unit: QtyUnit | null; net_weight_kg: number | null; cartons_per_pallet: number | null
  price_per_ton: number; line_total: number | null; price_id: string | null; sort_order: number
}
export type Quotation = {
  id: string; number: string; status: QuoteStatus; version: number; issue_date: string
  validity_days: number | null; valid_until: string | null
  customer_name: string | null; customer_company: string | null; customer_country: string | null
  customer_email: string | null; customer_phone: string | null; destination: string | null
  incoterm: Incoterm | null; currency: string; payment_terms: string | null; production_time: string | null
  policy_lines: string[]; show_quantities: boolean; plan_id: string | null; notes: string | null
  sent_at: string | null; created_at: string; created_by: string; updated_at: string
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

/** Net tons for a line, from its quantity and unit. */
export function lineTons(i: Pick<QuoteItem, 'quantity' | 'quantity_unit' | 'net_weight_kg' | 'cartons_per_pallet'>): number | null {
  if (!i.quantity || !i.quantity_unit) return null
  if (i.quantity_unit === 'tons') return i.quantity
  if (!i.net_weight_kg) return null
  if (i.quantity_unit === 'cartons') return (i.quantity * i.net_weight_kg) / 1000
  if (!i.cartons_per_pallet) return null
  return (i.quantity * i.cartons_per_pallet * i.net_weight_kg) / 1000
}
export function lineTotal(i: Parameters<typeof lineTons>[0] & { price_per_ton: number | null }) {
  const t = lineTons(i)
  return t != null && i.price_per_ton ? Math.round(t * i.price_per_ton * 100) / 100 : null
}

/** Fills {validity_days}, {incoterm}, {production_time} in the policy templates. */
export function renderPolicy(templates: string[], v: { validity_days: number | null; incoterm: string | null; production_time: string | null }) {
  return templates.map((t) => t
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
