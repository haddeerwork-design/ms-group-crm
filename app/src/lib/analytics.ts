import { supabase } from './supabase'
import type { Company } from './crm'
import type { Quotation } from './quotations'
import type { Order, Payment } from './orders'
import type { Opportunity, Stage, Task } from './sales'

// ---------------------------------------------------------------------
// Rules used everywhere in Dashboard & Reports
//  • Money is NEVER converted between currencies here (no invented rates):
//    every total is per currency, and charts show one currency at a time.
//  • "Sales" = orders that are not cancelled, valued at their line totals
//    + other charges, dated by order_date.
//  • Quotation success = accepted ÷ (accepted + rejected + expired).
//    Drafts and quotations still waiting for an answer are not counted.
// ---------------------------------------------------------------------

export type Range = { from: string; to: string } // inclusive ISO dates
export const PRESETS = { this_month: 'This month', last_month: 'Last month', last_90: 'Last 90 days', this_year: 'This year', last_12m: 'Last 12 months', all: 'All time' } as const
export type Preset = keyof typeof PRESETS

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

export function rangeFor(p: Preset, today: string): Range {
  const [y, m] = today.split('-').map(Number)
  const t = new Date(today + 'T00:00:00Z')
  switch (p) {
    case 'this_month': return { from: iso(utc(y, m - 1, 1)), to: today }
    case 'last_month': return { from: iso(utc(y, m - 2, 1)), to: iso(utc(y, m - 1, 0)) }
    case 'last_90': return { from: iso(new Date(t.getTime() - 89 * 864e5)), to: today }
    case 'this_year': return { from: `${y}-01-01`, to: today }
    case 'last_12m': return { from: iso(utc(y, m - 12, 1)), to: today }
    case 'all': return { from: '0000-01-01', to: '9999-12-31' }
  }
}
/** The period of the same length just before r (null for "all time"). */
export function previousRange(r: Range): Range | null {
  if (r.from === '0000-01-01') return null
  const day = 864e5
  const from = Date.parse(r.from + 'T00:00:00Z'), to = Date.parse(r.to + 'T00:00:00Z')
  const n = Math.round((to - from) / day) + 1
  return { from: iso(new Date(from - n * day)), to: iso(new Date(from - day)) }
}
/** % change from prev to cur; null when there is nothing to compare with. */
export const deltaPct = (cur: number, prev: number | null | undefined) => (prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100)
export const inRange = (d: string | null | undefined, r: Range) => !!d && d.slice(0, 10) >= r.from && d.slice(0, 10) <= r.to

/** Month keys (YYYY-MM) covering the range; for "all time" the span of the data. */
export function monthKeys(r: Range, dataDates: string[] = []): string[] {
  let from = r.from, to = r.to
  if (from === '0000-01-01') { const ds = dataDates.filter(Boolean).sort(); if (!ds.length) return []; from = ds[0]; to = ds[ds.length - 1] }
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const out: string[] = []
  while ((y < ty || (y === ty && m <= tm)) && out.length < 120) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++ } }
  return out
}
export const monthLabel = (k: string) => new Date(k + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })

export type SaleOrder = Pick<Order, 'id' | 'number' | 'stage' | 'order_date' | 'currency' | 'other_charges' | 'customer_company' | 'customer_country' | 'company_id' | 'created_by' | 'shipping_method' | 'eta' | 'arrival_date' | 'departure_date'> & {
  order_items: { line_total: number; product_id: string | null; description: string }[]
}
export const isSale = (o: Pick<Order, 'stage'>) => o.stage !== 'cancelled'
export const saleValue = (o: SaleOrder) => o.order_items.reduce((s, i) => s + Number(i.line_total || 0), 0) + Number(o.other_charges || 0)

export function currencies(orders: SaleOrder[]): string[] {
  const c = new Map<string, number>()
  for (const o of orders) if (isSale(o)) c.set(o.currency, (c.get(o.currency) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}

export function salesTotals(orders: SaleOrder[], r: Range) {
  const m = new Map<string, { currency: string; total: number; count: number }>()
  for (const o of orders) {
    if (!isSale(o) || !inRange(o.order_date, r)) continue
    const t = m.get(o.currency) ?? { currency: o.currency, total: 0, count: 0 }
    t.total += saleValue(o); t.count++
    m.set(o.currency, t)
  }
  return [...m.values()].sort((a, b) => b.total - a.total)
}

export function salesByMonth(orders: SaleOrder[], r: Range, currency: string) {
  const live = orders.filter((o) => isSale(o) && o.currency === currency && inRange(o.order_date, r))
  const keys = monthKeys(r, live.map((o) => o.order_date))
  const sums = new Map(keys.map((k) => [k, 0]))
  for (const o of live) { const k = o.order_date.slice(0, 7); if (sums.has(k)) sums.set(k, sums.get(k)! + saleValue(o)) }
  return keys.map((k) => ({ key: k, label: monthLabel(k), value: round2(sums.get(k)!) }))
}

/** Generic group-by for one currency. Items without a key go to "Not set". Top N, rest folded into "Other". */
export function groupSales(orders: SaleOrder[], r: Range, currency: string, by: 'country' | 'customer' | 'employee' | 'product', names: Record<string, string> = {}, top = 8) {
  const m = new Map<string, number>()
  const add = (k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
  for (const o of orders) {
    if (!isSale(o) || o.currency !== currency || !inRange(o.order_date, r)) continue
    if (by === 'product') {
      for (const i of o.order_items) add(i.product_id ? names[i.product_id] ?? i.description : i.description || 'Not set', Number(i.line_total || 0))
    } else {
      const k = by === 'country' ? o.customer_country : by === 'customer' ? o.customer_company : (o.created_by && (names[o.created_by] ?? 'Unknown user'))
      add(k?.trim() || 'Not set', saleValue(o))
    }
  }
  return foldTop([...m.entries()].map(([label, value]) => ({ label, value: round2(value) })), top)
}

export function foldTop(rows: { label: string; value: number }[], top: number) {
  const s = [...rows].sort((a, b) => b.value - a.value)
  if (s.length <= top) return s
  const rest = s.slice(top - 1).reduce((t, x) => t + x.value, 0)
  return [...s.slice(0, top - 1), { label: 'Other', value: round2(rest) }]
}

export type Q = Pick<Quotation, 'status' | 'issue_date' | 'sent_at' | 'created_by' | 'currency'>
export function quoteStats(qs: Q[], r: Range) {
  const inR = qs.filter((q) => inRange(q.issue_date, r))
  const n = (s: string) => inR.filter((q) => q.status === s).length
  const accepted = n('accepted'), rejected = n('rejected'), expired = n('expired')
  const decided = accepted + rejected + expired
  return {
    total: inR.length, sent: inR.filter((q) => q.status !== 'draft' && q.status !== 'revised').length,
    waiting: n('sent'), accepted, rejected, expired, decided, successRate: decided ? (accepted / decided) * 100 : null,
  }
}

export type C = Pick<Company, 'id' | 'name' | 'country' | 'lead_status' | 'created_at' | 'owner_id' | 'next_follow_up_date' | 'archived_at'>
export const LEAD_OPEN = ['new_lead', 'contacted', 'interested', 'quotation_sent', 'sample_requested', 'negotiating'] as const
export function companyStats(cs: C[], r: Range, today: string) {
  const live = cs.filter((c) => !c.archived_at)
  const active = live.filter((c) => c.lead_status === 'active_customer').length
  return {
    total: live.length,
    activeLeads: live.filter((c) => (LEAD_OPEN as readonly string[]).includes(c.lead_status)).length,
    newInRange: live.filter((c) => inRange(c.created_at, r)).length,
    customers: active,
    conversionRate: live.length ? (active / live.length) * 100 : null,
    followUpsDue: live.filter((c) => c.next_follow_up_date && c.next_follow_up_date <= today && !['lost', 'inactive'].includes(c.lead_status)).length,
    overdueFollowUps: live.filter((c) => c.next_follow_up_date && c.next_follow_up_date < today && !['lost', 'inactive'].includes(c.lead_status)),
  }
}
export function leadsByStatus(cs: C[], labels: Record<string, string>) {
  const m = new Map<string, number>()
  for (const c of cs) if (!c.archived_at) m.set(c.lead_status, (m.get(c.lead_status) ?? 0) + 1)
  return Object.keys(labels).map((k) => ({ key: k, label: labels[k], value: m.get(k) ?? 0 }))
}

/** Shipments that have arrived with both ETA and arrival date. Arrived on or before ETA = on time. */
export function onTime(orders: SaleOrder[], r: Range) {
  const done = orders.filter((o) => isSale(o) && o.arrival_date && o.eta && inRange(o.arrival_date, r))
  const ok = done.filter((o) => o.arrival_date! <= o.eta!).length
  const missingDates = orders.filter((o) => isSale(o) && ['arrived', 'completed'].includes(o.stage) && (!o.arrival_date || !o.eta) && inRange(o.order_date, r)).length
  return { measured: done.length, onTime: ok, late: done.length - ok, rate: done.length ? (ok / done.length) * 100 : null, missingDates }
}
export function shipModes(orders: SaleOrder[], r: Range) {
  const m = { sea: 0, air: 0, land: 0, not_set: 0 }
  for (const o of orders) if (isSale(o) && inRange(o.order_date, r)) m[o.shipping_method ?? 'not_set']++
  return m
}
export function upcomingShipments(orders: SaleOrder[], today: string, days = 30) {
  const until = iso(new Date(new Date(today + 'T00:00:00Z').getTime() + days * 864e5))
  return orders
    .filter((o) => isSale(o) && !['arrived', 'completed'].includes(o.stage))
    .map((o) => ({ o, date: o.stage === 'shipped' ? o.eta : o.departure_date ?? o.eta }))
    .filter((x) => x.date && x.date >= today && x.date <= until)
    .sort((a, b) => a.date!.localeCompare(b.date!))
}

/** One row per team member. Revenue is per currency (never added across currencies). */
export function employeePerformance(
  team: { id: string; name: string }[], r: Range,
  d: { companies: C[]; quotes: Q[]; orders: SaleOrder[]; opps: Pick<Opportunity, 'owner_id' | 'stage_id' | 'closed_at'>[]; stages: Stage[] },
) {
  const won = new Set(d.stages.filter((s) => s.is_won).map((s) => s.id))
  return team.map((u) => {
    const q = quoteStats(d.quotes.filter((x) => x.created_by === u.id), r)
    const rev = salesTotals(d.orders.filter((o) => o.created_by === u.id), r)
    return {
      id: u.id, name: u.name,
      newLeads: d.companies.filter((c) => c.owner_id === u.id && !c.archived_at && inRange(c.created_at, r)).length,
      quotesSent: q.sent, quotesAccepted: q.accepted, successRate: q.successRate,
      dealsWon: d.opps.filter((o) => o.owner_id === u.id && won.has(o.stage_id) && inRange(o.closed_at, r)).length,
      orders: rev.reduce((s, x) => s + x.count, 0), revenue: rev,
    }
  })
}

export function inSeason(month: number, start: number | null, end: number | null) {
  if (!start || !end) return false
  return start <= end ? month >= start && month <= end : month >= start || month <= end
}

export const round2 = (n: number) => Math.round(n * 100) / 100
export const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(v >= 10 || v === 0 ? 0 : 1)}%`)
export const money = (v: number, ccy: string) => `${ccy} ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

// ---------------------------------------------------------------------
// Data loading — one call, everything RLS lets this user see.
// ---------------------------------------------------------------------
export type AnalyticsData = {
  orders: SaleOrder[]; quotes: (Q & { id: string; number: string; customer_company: string | null; valid_until: string | null })[]
  companies: C[]; opps: Opportunity[]; stages: Stage[]; tasks: Task[]; payments: Payment[]
  products: { id: string; name: string; season_start_month: number | null; season_end_month: number | null; availability: string; archived_at: string | null }[]
  team: { id: string; name: string }[]; warnings: string[]
}
export async function fetchAnalytics(): Promise<AnalyticsData> {
  const warnings: string[] = []
  const pick = <T,>(label: string, res: { data: unknown; error: { message: string } | null }): T[] => {
    if (res.error) { warnings.push(`${label}: ${res.error.message}`); return [] }
    return (res.data ?? []) as T[]
  }
  const [o, q, c, op, st, t, p, pr, tm] = await Promise.all([
    supabase.from('sales_orders').select('id, number, stage, order_date, currency, other_charges, customer_company, customer_country, company_id, created_by, shipping_method, eta, arrival_date, departure_date, order_items(line_total, product_id, description)'),
    supabase.from('quotations').select('id, number, status, issue_date, sent_at, created_by, currency, customer_company, valid_until'),
    supabase.from('companies').select('id, name, country, lead_status, created_at, owner_id, next_follow_up_date, archived_at'),
    supabase.from('opportunities').select('*'),
    supabase.from('pipeline_stages').select('*').order('sort_order'),
    supabase.from('tasks').select('*'),
    supabase.from('payments').select('*'),
    supabase.from('products').select('id, name, season_start_month, season_end_month, availability, archived_at'),
    supabase.rpc('list_sales_team'),
  ])
  return {
    orders: pick('Orders', o), quotes: pick('Quotations', q), companies: pick('Companies', c), opps: pick('Opportunities', op),
    stages: pick('Pipeline stages', st), tasks: pick('Tasks', t), payments: pick('Payments', p), products: pick('Products', pr),
    team: pick<{ id: string; name: string }>('Team', tm), warnings,
  }
}
