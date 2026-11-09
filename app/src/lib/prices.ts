import { supabase } from './supabase'
import type { Incoterm, Rate } from './pricing'

export type PriceListRow = {
  id: string; product_id: string; packaging_id: string | null; variety: string | null
  incoterm: Incoterm | null; destination: string | null; net_weight_kg: number | null; cartons_per_pallet: number | null
  sell_currency: string; price_per_ton: number; valid_from: string; valid_until: string | null
  source: 'app' | 'imported'; created_at: string
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
  return (data ?? []) as PriceVersion[]
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
