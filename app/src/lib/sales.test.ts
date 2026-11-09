import { describe, expect, it } from 'vitest'
import { liveReminders, pipelineSummary, taskBucket, type Stage } from './sales'

const stages: Stage[] = [
  { id: 'n', name: 'New', sort_order: 1, is_won: false, is_lost: false, archived_at: null },
  { id: 'w', name: 'Won', sort_order: 2, is_won: true, is_lost: false, archived_at: null },
  { id: 'l', name: 'Lost', sort_order: 3, is_won: false, is_lost: true, archived_at: null },
]
const o = (stage_id: string, rev: number | null, ccy: string, p: number | null, archived = false) =>
  ({ stage_id, expected_revenue: rev, currency: ccy, probability: p, archived_at: archived ? 'x' : null })

describe('pipelineSummary', () => {
  const s = pipelineSummary([o('n', 10000, 'USD', 50), o('n', 4000, 'USD', null), o('n', 2000, 'EUR', 25), o('w', 9000, 'USD', 100), o('l', 1, 'USD', 10), o('l', 1, 'USD', 10), o('n', 99999, 'USD', 90, true)], stages)
  it('open and weighted totals per currency, archived ignored', () => {
    expect(s.totals[0]).toEqual({ currency: 'USD', open: 14000, weighted: 5000, openCount: 2, withoutProbability: 1 })
    expect(s.totals[1]).toEqual({ currency: 'EUR', open: 2000, weighted: 500, openCount: 1, withoutProbability: 0 })
  })
  it('win rate = won / (won + lost)', () => {
    expect(s.won).toBe(1); expect(s.lost).toBe(2)
    expect(s.winRate).toBeCloseTo(33.33, 1)
  })
  it('no closed deals → no win rate', () => {
    expect(pipelineSummary([o('n', 1, 'USD', 1)], stages).winRate).toBeNull()
  })
})

describe('tasks and reminders', () => {
  const today = '2026-11-09'
  it('buckets', () => {
    expect(taskBucket({ status: 'open', due_date: '2026-11-01' }, today)).toBe('overdue')
    expect(taskBucket({ status: 'open', due_date: today }, today)).toBe('today')
    expect(taskBucket({ status: 'in_progress', due_date: '2026-12-01' }, today)).toBe('upcoming')
    expect(taskBucket({ status: 'open', due_date: null }, today)).toBe('no_date')
    expect(taskBucket({ status: 'done', due_date: '2026-11-01' }, today)).toBe('done')
  })
  it('reminders only for my items, overdue first', () => {
    const r = liveReminders({
      me: 'me', today,
      tasks: [{ id: '1', title: 'A', status: 'open', due_date: today, assignee_id: 'me' }, { id: '2', title: 'B', status: 'open', due_date: '2026-11-01', assignee_id: 'other' }],
      companies: [{ id: 'c', name: 'Gulf', next_follow_up_date: '2026-11-05', owner_id: 'me', archived_at: null }, { id: 'd', name: 'Later', next_follow_up_date: '2026-12-01', owner_id: 'me', archived_at: null }],
      quotations: [{ id: 'q', number: 'QTN-1', status: 'sent', valid_until: '2026-11-10', created_by: 'me' }, { id: 'q2', number: 'QTN-2', status: 'accepted', valid_until: '2026-11-01', created_by: 'me' }],
    })
    expect(r.map((x) => x.title)).toEqual(['Overdue follow-up', 'Task due today', 'Quotation expiring'])
  })
})
