import { supabase } from './supabase'
import type { Incoterm } from './pricing'

export type PIStatus = 'draft' | 'issued' | 'revised' | 'cancelled'
export const PI_STATUS: Record<PIStatus, string> = { draft: 'Draft', issued: 'Issued', revised: 'Revised (editing)', cancelled: 'Cancelled' }
export const PI_STYLE: Record<PIStatus, string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  revised: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  issued: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  cancelled: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
}
export type QtyUnitPI = 'tons' | 'cartons' | 'kg' | 'pieces'
export type PriceUnit = 'ton' | 'kg' | 'carton' | 'piece'
export type PIItem = { id?: string; product_id: string | null; description: string; packing: string | null; quantity: number; unit: QtyUnitPI; net_weight_kg: number | null; unit_price: number; price_unit: PriceUnit; line_total: number; sort_order: number }
export type Proforma = {
  id: string; number: string; status: PIStatus; version: number; quotation_id: string | null; company_id: string | null; issue_date: string
  customer_name: string | null; customer_company: string | null; customer_address: string | null; customer_country: string | null; customer_email: string | null; customer_phone: string | null
  incoterm: Incoterm | null; currency: string; port_of_loading: string | null; port_of_discharge: string | null; destination: string | null
  shipment_mode: 'sea' | 'air' | 'land' | null; container_details: string | null; estimated_shipment: string | null; payment_terms: string | null
  other_charges_label: string | null; other_charges: number | null; bank_details: string | null; terms: string | null; notes: string | null
  issued_at: string | null; created_at: string; created_by: string; updated_at: string; proforma_items?: PIItem[]
}

/** Amount for one line. Converts between quantity unit and price unit using net kg per carton when needed. */
export function lineAmount(qty: number | null, unit: QtyUnitPI, netKg: number | null, price: number | null, priceUnit: PriceUnit): number | null {
  if (!qty || qty <= 0 || price == null || price < 0) return null
  const kg = unit === 'tons' ? qty * 1000 : unit === 'kg' ? qty : unit === 'cartons' && netKg ? qty * netKg : null
  let units: number | null = null
  if (priceUnit === 'ton') units = kg != null ? kg / 1000 : null
  else if (priceUnit === 'kg') units = kg
  else if (priceUnit === 'carton') units = unit === 'cartons' ? qty : kg != null && netKg ? kg / netKg : null
  else units = unit === 'pieces' ? qty : null
  return units == null ? null : Math.round(units * price * 100) / 100
}

export async function fetchProformas() {
  const { data, error } = await supabase.from('proforma_invoices').select('*, proforma_items(line_total)').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as (Proforma & { proforma_items: { line_total: number }[] })[]
}
export async function fetchProforma(id: string) {
  const [p, v] = await Promise.all([
    supabase.from('proforma_invoices').select('*, proforma_items(*)').eq('id', id).single(),
    supabase.from('proforma_versions').select('*').eq('proforma_id', id).order('version', { ascending: false }),
  ])
  if (p.error) throw p.error
  if (v.error) throw v.error
  const pi = p.data as Proforma
  pi.proforma_items = (pi.proforma_items ?? []).sort((a, b) => a.sort_order - b.sort_order)
  return { pi, versions: (v.data ?? []) as { id: number; version: number; snapshot: Proforma & { items: PIItem[] }; created_at: string }[] }
}
