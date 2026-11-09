import { supabase } from './supabase'
import type { Incoterm } from './pricing'
import type { QtyUnit } from './planner'

export type ContainerType = {
  id: string; name: string; is_reefer: boolean; max_pallets: number; max_payload_kg: number
  pallet_type: string | null; empty_pallet_kg: number; internal_volume_cbm: number | null
  notes: string | null; sort_order: number; archived_at: string | null
}
export type PlanItem = {
  id?: string; product_id: string; packaging_id: string | null; variety: string | null
  qty_unit: QtyUnit; quantity: number; net_weight_kg: number | null; gross_weight_kg: number | null
  cartons_per_pallet: number | null; price_per_ton: number | null; price_id: string | null; sort_order: number
}
export type Plan = {
  id: string; name: string; container_type_id: string | null; container_count: number
  max_pallets: number | null; max_payload_kg: number | null; empty_pallet_kg: number | null
  customer_name: string | null; destination: string | null; incoterm: Incoterm | null; currency: string | null
  notes: string | null; created_at: string; created_by: string; updated_at: string
  container_plan_items?: PlanItem[]
}

export async function fetchContainerTypes() {
  const { data, error } = await supabase.from('container_types').select('*').order('sort_order').order('name')
  if (error) throw error
  return (data ?? []) as ContainerType[]
}
export async function fetchPlans() {
  const { data, error } = await supabase.from('container_plans').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Plan[]
}
export async function fetchPlan(id: string) {
  const { data, error } = await supabase.from('container_plans').select('*, container_plan_items(*)').eq('id', id).single()
  if (error) throw error
  const p = data as Plan
  p.container_plan_items = (p.container_plan_items ?? []).sort((a, b) => a.sort_order - b.sort_order)
  return p
}
