import { supabase } from './supabase'
import type { Incoterm } from './pricing'
import type { PriceUnit, QtyUnitPI } from './proformas'

export const STAGES = ['confirmed', 'awaiting_advance', 'preparing', 'packing', 'ready', 'booked', 'shipped', 'arrived', 'completed'] as const
export type Stage = (typeof STAGES)[number] | 'cancelled'
export const STAGE_LABEL: Record<Stage, string> = {
  confirmed: 'Confirmed', awaiting_advance: 'Awaiting advance', preparing: 'Preparing products', packing: 'Packing', ready: 'Ready for shipment',
  booked: 'Booked', shipped: 'Shipped', arrived: 'Arrived', completed: 'Completed', cancelled: 'Cancelled',
}
export const DOC_TYPES = {
  commercial_invoice: 'Commercial Invoice', packing_list: 'Packing List', phytosanitary: 'Phytosanitary Certificate',
  certificate_of_origin: 'Certificate of Origin', bl_awb: 'Bill of Lading / AWB', quality_certificate: 'Quality Certificate',
  health_certificate: 'Health Certificate', other: 'Other',
} as const
export type DocType = keyof typeof DOC_TYPES

export type OrderItem = { id?: string; product_id: string | null; description: string; packing: string | null; quantity: number; unit: QtyUnitPI; net_weight_kg: number | null; unit_price: number; price_unit: PriceUnit; line_total: number; sort_order: number }
export type Order = {
  id: string; number: string; stage: Stage; company_id: string | null; quotation_id: string | null; proforma_id: string | null; order_date: string
  customer_company: string | null; customer_name: string | null; customer_country: string | null; currency: string; incoterm: Incoterm | null
  payment_terms: string | null; other_charges: number; shipping_method: 'sea' | 'air' | 'land' | null; forwarder_id: string | null; carrier: string | null
  origin: string | null; port_of_loading: string | null; destination: string | null; port_of_discharge: string | null; departure_date: string | null
  eta: string | null; arrival_date: string | null; bl_awb_number: string | null; container_numbers: string | null; booking_number: string | null
  shipment_notes: string | null; notes: string | null; created_at: string; created_by: string; updated_at: string; order_items?: OrderItem[]
}
export type OrderDoc = { id: string; order_id: string; doc_type: DocType; file_path: string; file_name: string; size_bytes: number | null; mime_type: string | null; notes: string | null; uploaded_at: string; uploaded_by: string | null }
export type Payment = {
  id: string; direction: 'in' | 'out'; kind: string; order_id: string | null; company_id: string | null; supplier_id: string | null; forwarder_id: string | null
  description: string | null; amount_due: number; currency: string; due_date: string | null; amount_paid: number; paid_date: string | null
  method: string | null; reference: string | null; confirmed_by: string | null; confirmed_at: string | null; cancelled_at: string | null; notes: string | null; created_at: string
}
export const PAY_KIND = { advance: 'Advance', balance: 'Balance', full: 'Full payment', installment: 'Installment', supplier: 'Supplier', freight: 'Freight', customs: 'Customs', expense: 'Expense', other: 'Other' } as const
export const PAY_METHOD = { bank_transfer: 'Bank transfer', letter_of_credit: 'Letter of Credit', cash: 'Cash', cheque: 'Cheque', card: 'Card', other: 'Other' } as const

// ---------------------------------------------------------------------
// Pure helpers (covered by orders.test.ts)
// ---------------------------------------------------------------------
export type PayStatus = 'unpaid' | 'partial' | 'paid' | 'overdue' | 'cancelled'
export function paymentStatus(p: Pick<Payment, 'amount_due' | 'amount_paid' | 'due_date' | 'cancelled_at'>, today: string): PayStatus {
  if (p.cancelled_at) return 'cancelled'
  if (p.amount_paid >= p.amount_due) return 'paid'
  if (p.due_date && p.due_date < today) return 'overdue'
  return p.amount_paid > 0 ? 'partial' : 'unpaid'
}
export function outstandingByCurrency(ps: Payment[], direction: 'in' | 'out', today: string) {
  const m = new Map<string, { currency: string; outstanding: number; overdue: number; count: number }>()
  for (const p of ps) {
    if (p.direction !== direction || p.cancelled_at) continue
    const left = Math.max(0, p.amount_due - p.amount_paid)
    if (!left) continue
    const t = m.get(p.currency) ?? { currency: p.currency, outstanding: 0, overdue: 0, count: 0 }
    t.outstanding += left; t.count++
    if (p.due_date && p.due_date < today) t.overdue += left
    m.set(p.currency, t)
  }
  return [...m.values()]
}
/** Splits an order total into a payment schedule. Percentages must add up to 100. Rounding goes to the last part. */
export function splitSchedule(total: number, parts: { kind: string; percent: number; due_date: string | null }[]) {
  const sum = parts.reduce((s, p) => s + p.percent, 0)
  if (Math.abs(sum - 100) > 0.001) throw new Error(`Percentages add up to ${sum}%, not 100%.`)
  if (parts.some((p) => !(p.percent > 0))) throw new Error('Every part needs a percentage above 0.')
  const out = parts.map((p) => ({ ...p, amount: Math.round(total * p.percent) / 100 }))
  const diff = Math.round((total - out.reduce((s, p) => s + p.amount, 0)) * 100) / 100
  out[out.length - 1].amount = Math.round((out[out.length - 1].amount + diff) * 100) / 100
  return out
}
export function orderTotal(o: Pick<Order, 'other_charges'> & { order_items?: Pick<OrderItem, 'line_total'>[] }) {
  return (o.order_items ?? []).reduce((s, i) => s + Number(i.line_total), 0) + Number(o.other_charges ?? 0)
}

export async function fetchOrders() {
  const { data, error } = await supabase.from('sales_orders').select('*, order_items(line_total)').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as (Order & { order_items: { line_total: number }[] })[]
}
export async function fetchOrder(id: string) {
  const [o, d, h, p] = await Promise.all([
    supabase.from('sales_orders').select('*, order_items(*)').eq('id', id).single(),
    supabase.from('order_documents').select('*').eq('order_id', id).order('uploaded_at', { ascending: false }),
    supabase.from('order_stage_history').select('*').eq('order_id', id).order('changed_at'),
    supabase.from('payments').select('*').eq('order_id', id).order('due_date'),
  ])
  if (o.error) throw o.error
  const order = o.data as Order
  order.order_items = (order.order_items ?? []).sort((a, b) => a.sort_order - b.sort_order)
  return { order, docs: (d.data ?? []) as OrderDoc[], history: (h.data ?? []) as { id: number; from_stage: Stage | null; to_stage: Stage; changed_at: string; changed_by: string | null }[], payments: (p.data ?? []) as Payment[] }
}
export const safeFileName = (n: string) => n.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80)
