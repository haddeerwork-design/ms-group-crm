import { supabase } from './supabase'
import type { Incoterm, Rate } from './pricing'

export type PriceListRow = {
  id: string; product_id: string; packaging_id: string | null; variety: string | null
  incoterm: Incoterm | null; destination: string | null; net_weight_kg: number | null; cartons_per_pallet: number | null
  sell_currency: string; price_per_ton: number; valid_from: string; valid_until: string | null
  source: 'app' | 'imported'; created_at: string
  price_basis?: 'ton' | 'unit' | null; unit_price?: number | null; unit_label?: string | null
}

export type PriceVersion = PriceListRow & {
  cost_currency: string | null; cost_per_kg: number | null; packaging_cost_per_carton: number | null
  handling_cost_per_carton: number | null; inland_transport_per_ton: number | null; documentation_per_ton: number | null
  other_costs_per_ton: number | null; freight_per_ton: number | null; insurance_per_ton: number | null
  destination_costs_per_ton: number | null; duties_per_ton: number | null
  fx_rate: number | null; fx_source: string | null; fx_rate_at: string | null
  total_cost_per_ton: number | null; margin_pct: number | null; notes: string | null; created_by: string | null
}

export type SavedRate = Rate & { id: number; notes: string | null; created_at: string }

export async function fetchPriceList() {
  const { data, error } = await supabase.from('product_price_list').select('*')
  if (error) throw error
  return (data ?? []) as PriceListRow[]
}

export async function fetchVersions(productId: string) {
  const { data, error } = await supabase.from('product_prices').select('*').eq('product_id', productId).order('created_at', { ascending: false })
  if (error) throw error
  // removed prices (migration 0020) stay in the database for old quotations, but not here
  return ((data ?? []) as (PriceVersion & { removed_at?: string | null })[]).filter((v) => !v.removed_at)
}

/** Removes one line of the price list (every version of it). Returns the ids, for Undo. */
export async function removePriceLine(r: Pick<PriceListRow, 'product_id' | 'packaging_id' | 'variety'>): Promise<string[]> {
  const { data, error } = await supabase.rpc('remove_price_line', { p_product: r.product_id, p_packaging: r.packaging_id, p_variety: r.variety ?? '' })
  if (error) throw new Error(/remove_price_line|function/i.test(error.message) && /not find|does not exist/i.test(error.message) ? 'Run migration 0020_remove_prices first.' : error.message)
  return (data ?? []) as string[]
}
export async function restorePrices(ids: string[]) {
  const { error } = await supabase.rpc('restore_prices', { p_ids: ids })
  if (error) throw error
}

export async function fetchLatestRates() {
  const { data, error } = await supabase.from('exchange_rates_latest').select('*')
  if (error) throw error
  return (data ?? []) as SavedRate[]
}

export async function fetchRateHistory(limit = 60) {
  const { data, error } = await supabase.from('exchange_rates').select('*').order('rate_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as SavedRate[]
}

export function isExpired(r: { valid_until: string | null }, today = new Date().toISOString().slice(0, 10)) {
  return !!r.valid_until && r.valid_until < today
}

export const money = (v: number | null | undefined, ccy?: string, d = 2) =>
  v == null || !isFinite(v) ? '—' : `${Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}${ccy ? ' ' + ccy : ''}`

export function ageLabel(iso: string, now = new Date()) {
  const h = (now.getTime() - new Date(iso).getTime()) / 36e5
  if (h < 1) return 'less than an hour ago'
  if (h < 48) return `${Math.round(h)} h ago`
  return `${Math.round(h / 24)} days ago`
}

/** A selling price with no end date is "old" after this many days. */
export const OLD_PRICE_DAYS = 60
export const EXPIRING_DAYS = 7
export type PriceHealth = 'expired' | 'expiring' | 'old' | 'ok'
const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 864e5)

/** Does this selling price need attention? Prices imported from the old CRM are flagged separately. */
export function priceHealth(r: Pick<PriceListRow, 'valid_from' | 'valid_until' | 'source'>, today = new Date().toISOString().slice(0, 10)): { state: PriceHealth; days: number } {
  if (r.valid_until && r.valid_until < today) return { state: 'expired', days: dayDiff(today, r.valid_until) }
  if (r.valid_until && dayDiff(r.valid_until, today) <= EXPIRING_DAYS) return { state: 'expiring', days: dayDiff(r.valid_until, today) }
  if (!r.valid_until && r.source !== 'imported' && dayDiff(today, r.valid_from.slice(0, 10)) >= OLD_PRICE_DAYS) return { state: 'old', days: dayDiff(today, r.valid_from.slice(0, 10)) }
  return { state: 'ok', days: 0 }
}
export function priceHealthSummary(rows: Pick<PriceListRow, 'valid_from' | 'valid_until' | 'source'>[], today?: string) {
  const s = { expired: 0, expiring: 0, old: 0 }
  for (const r of rows) { const h = priceHealth(r, today).state; if (h !== 'ok') s[h]++ }
  return { ...s, total: s.expired + s.expiring + s.old }
}
