import { supabase } from './supabase'
import type { QtyUnit } from './planner'

export type Stage = { id: string; name: string; sort_order: number; is_won: boolean; is_lost: boolean; archived_at: string | null }
export type Opportunity = {
  id: string; company_id: string; title: string; stage_id: string; product_id: string | null; product_text: string | null
  expected_quantity: number | null; quantity_unit: QtyUnit | null; expected_revenue: number | null; currency: string
  probability: number | null; expected_close_date: string | null; next_action: string | null; notes: string | null
  quotation_id: string | null; lost_reason: string | null; closed_at: string | null; owner_id: string | null
  archived_at: string | null; created_at: string; updated_at: string
}
export type Task = {
  id: string; title: string; description: string | null; company_id: string | null; opportunity_id: string | null
  assignee_id: string; due_date: string | null; priority: 'high' | 'medium' | 'low'; status: 'open' | 'in_progress' | 'done' | 'cancelled'
  reminder_at: string | null; completed_at: string | null; created_at: string; created_by: string
}
export type Notification = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

export const TASK_STATUS = { open: 'Open', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' } as const

export async function fetchStages() {
  const { data, error } = await supabase.from('pipeline_stages').select('*').order('sort_order')
  if (error) throw error
  return (data ?? []) as Stage[]
}
export async function fetchOpportunities() {
  const { data, error } = await supabase.from('opportunities').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Opportunity[]
}
export async function fetchTasks() {
  const { data, error } = await supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as Task[]
}

// ---------------------------------------------------------------------
// Pure helpers (covered by sales.test.ts)
// ---------------------------------------------------------------------
export type CurrencyTotals = { currency: string; open: number; weighted: number; openCount: number; withoutProbability: number }
export function pipelineSummary(opps: Pick<Opportunity, 'stage_id' | 'expected_revenue' | 'currency' | 'probability' | 'archived_at'>[], stages: Stage[]) {
  const st = Object.fromEntries(stages.map((s) => [s.id, s]))
  const live = opps.filter((o) => !o.archived_at && st[o.stage_id])
  const open = live.filter((o) => !st[o.stage_id].is_won && !st[o.stage_id].is_lost)
  const won = live.filter((o) => st[o.stage_id].is_won).length
  const lost = live.filter((o) => st[o.stage_id].is_lost).length
  const byCcy = new Map<string, CurrencyTotals>()
  for (const o of open) {
    const t = byCcy.get(o.currency) ?? { currency: o.currency, open: 0, weighted: 0, openCount: 0, withoutProbability: 0 }
    t.openCount++
    t.open += o.expected_revenue ?? 0
    if (o.probability == null) t.withoutProbability++
    else t.weighted += ((o.expected_revenue ?? 0) * o.probability) / 100
    byCcy.set(o.currency, t)
  }
  return { totals: [...byCcy.values()].sort((a, b) => b.open - a.open), openCount: open.length, won, lost, winRate: won + lost ? (won / (won + lost)) * 100 : null }
}

export type Bucket = 'overdue' | 'today' | 'upcoming' | 'no_date' | 'done'
export function taskBucket(t: Pick<Task, 'status' | 'due_date'>, today: string): Bucket {
  if (t.status === 'done' || t.status === 'cancelled') return 'done'
  if (!t.due_date) return 'no_date'
  if (t.due_date < today) return 'overdue'
  if (t.due_date === today) return 'today'
  return 'upcoming'
}

export type Reminder = { key: string; tone: 'red' | 'amber'; title: string; body: string; link: string }
/** Live reminders computed from current data (nothing is stored or sent). */
export function liveReminders(input: {
  me: string; today: string
  tasks: Pick<Task, 'id' | 'title' | 'status' | 'due_date' | 'assignee_id'>[]
  companies: { id: string; name: string; next_follow_up_date: string | null; owner_id: string | null; archived_at: string | null }[]
  quotations: { id: string; number: string; status: string; valid_until: string | null; created_by: string }[]
}): Reminder[] {
  const r: Reminder[] = []
  const in2 = new Date(input.today + 'T00:00:00Z'); in2.setUTCDate(in2.getUTCDate() + 2)
  const soon = in2.toISOString().slice(0, 10)
  for (const t of input.tasks) {
    if (t.assignee_id !== input.me) continue
    const b = taskBucket(t, input.today)
    if (b === 'overdue') r.push({ key: 't' + t.id, tone: 'red', title: 'Overdue task', body: `${t.title} (due ${t.due_date})`, link: '/tasks' })
    if (b === 'today') r.push({ key: 't' + t.id, tone: 'amber', title: 'Task due today', body: t.title, link: '/tasks' })
  }
  for (const c of input.companies) {
    if (c.owner_id !== input.me || c.archived_at || !c.next_follow_up_date || c.next_follow_up_date > input.today) continue
    r.push({ key: 'c' + c.id, tone: c.next_follow_up_date < input.today ? 'red' : 'amber', title: c.next_follow_up_date < input.today ? 'Overdue follow-up' : 'Follow-up today', body: c.name, link: `/crm/${c.id}` })
  }
  for (const q of input.quotations) {
    if (q.created_by !== input.me || q.status !== 'sent' || !q.valid_until) continue
    if (q.valid_until < input.today) r.push({ key: 'q' + q.id, tone: 'red', title: 'Quotation validity passed', body: `${q.number} — mark it expired or revise`, link: `/quotations/${q.id}` })
    else if (q.valid_until <= soon) r.push({ key: 'q' + q.id, tone: 'amber', title: 'Quotation expiring', body: `${q.number} valid until ${q.valid_until}`, link: `/quotations/${q.id}` })
  }
  return r.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'red' ? -1 : 1))
}
