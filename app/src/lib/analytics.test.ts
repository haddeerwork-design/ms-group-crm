import { describe, expect, it } from 'vitest'
import { companyStats, employeePerformance, foldTop, groupSales, inSeason, monthKeys, onTime, quoteStats, rangeFor, salesByMonth, salesTotals, upcomingShipments, type SaleOrder } from './analytics'

const order = (p: Partial<SaleOrder>): SaleOrder => ({
  id: Math.random().toString(), number: 'SO', stage: 'confirmed', order_date: '2026-10-05', currency: 'USD', other_charges: 0,
  customer_company: 'A', customer_country: 'UAE', company_id: null, created_by: 'u1', shipping_method: 'sea', eta: null, arrival_date: null, departure_date: null,
  order_items: [{ line_total: 1000, product_id: 'p1', description: 'Mango' }], ...p,
})

describe('date ranges', () => {
  it('presets', () => {
    expect(rangeFor('this_month', '2026-11-09')).toEqual({ from: '2026-11-01', to: '2026-11-09' })
    expect(rangeFor('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(rangeFor('last_12m', '2026-11-09').from).toBe('2025-12-01') // 12 months incl. this one
    expect(rangeFor('last_90', '2026-11-09').from).toBe('2026-08-12')
  })
  it('month keys cross the year and follow the data for all-time', () => {
    expect(monthKeys({ from: '2025-11-01', to: '2026-02-10' })).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(monthKeys(rangeFor('all', '2026-11-09'), ['2026-03-02', '2026-01-20'])).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(monthKeys(rangeFor('all', '2026-11-09'), [])).toEqual([])
  })
})

describe('sales', () => {
  const r = { from: '2026-10-01', to: '2026-11-30' }
  const os = [
    order({ other_charges: 200 }),
    order({ currency: 'EUR', order_date: '2026-11-02' }),
    order({ stage: 'cancelled' }),
    order({ order_date: '2026-09-30' }),
    order({ order_date: '2026-11-20', customer_country: null, created_by: 'u2', order_items: [{ line_total: 500, product_id: null, description: 'Okra' }] }),
  ]
  it('per currency, cancelled and out-of-range excluded, never mixed', () => {
    expect(salesTotals(os, r)).toEqual([{ currency: 'USD', total: 1700, count: 2 }, { currency: 'EUR', total: 1000, count: 1 }])
  })
  it('by month includes empty months', () => {
    expect(salesByMonth(os, r, 'USD').map((x) => x.value)).toEqual([1200, 500])
  })
  it('group by country / product / employee', () => {
    expect(groupSales(os, r, 'USD', 'country')).toEqual([{ label: 'UAE', value: 1200 }, { label: 'Not set', value: 500 }])
    expect(groupSales(os, r, 'USD', 'product', { p1: 'Keitt Mango' }).map((x) => x.label)).toEqual(['Keitt Mango', 'Okra'])
    expect(groupSales(os, r, 'USD', 'employee', { u1: 'Hanaa' }).map((x) => x.label)).toEqual(['Hanaa', 'Unknown user'])
  })
  it('folds the tail into Other', () => {
    const f = foldTop([5, 4, 3, 2, 1].map((v, i) => ({ label: `x${i}`, value: v })), 3)
    expect(f).toEqual([{ label: 'x0', value: 5 }, { label: 'x1', value: 4 }, { label: 'Other', value: 6 }])
  })
})

describe('quotations & leads', () => {
  const r = { from: '2026-01-01', to: '2026-12-31' }
  it('success rate only counts decided quotations', () => {
    const q = (status: string) => ({ status, issue_date: '2026-05-01', sent_at: null, created_by: 'u1', currency: 'USD' }) as never
    const s = quoteStats([q('accepted'), q('rejected'), q('expired'), q('accepted'), q('sent'), q('draft')], r)
    expect(s).toMatchObject({ total: 6, sent: 5, waiting: 1, decided: 4, successRate: 50 })
    expect(quoteStats([q('sent')], r).successRate).toBeNull()
  })
  it('company stats', () => {
    const c = (lead_status: string, extra = {}) => ({ id: '1', name: 'x', country: null, lead_status, created_at: '2026-11-03T10:00:00Z', owner_id: 'u1', next_follow_up_date: null, archived_at: null, ...extra }) as never
    const s = companyStats([c('active_customer'), c('new_lead', { next_follow_up_date: '2026-11-01' }), c('lost', { next_follow_up_date: '2026-11-01' }), c('interested', { archived_at: 'x' })], { from: '2026-11-01', to: '2026-11-09' }, '2026-11-09')
    expect(s).toMatchObject({ total: 3, activeLeads: 1, newInRange: 3, customers: 1, followUpsDue: 1 })
    expect(s.conversionRate).toBeCloseTo(33.33, 1)
  })
})

describe('shipments', () => {
  const r = { from: '2026-01-01', to: '2026-12-31' }
  it('on-time rate needs both dates', () => {
    const os = [
      order({ stage: 'arrived', eta: '2026-06-10', arrival_date: '2026-06-09' }),
      order({ stage: 'arrived', eta: '2026-06-10', arrival_date: '2026-06-12' }),
      order({ stage: 'completed', eta: null, arrival_date: '2026-06-12' }),
    ]
    expect(onTime(os, r)).toEqual({ measured: 2, onTime: 1, late: 1, rate: 50, missingDates: 1 })
  })
  it('upcoming uses departure before shipping, ETA after', () => {
    const os = [
      order({ number: 'a', stage: 'booked', departure_date: '2026-11-20' }),
      order({ number: 'b', stage: 'shipped', departure_date: '2026-11-01', eta: '2026-11-12' }),
      order({ number: 'c', stage: 'arrived', eta: '2026-11-12' }),
      order({ number: 'd', stage: 'booked', departure_date: '2027-03-01' }),
    ]
    expect(upcomingShipments(os, '2026-11-09').map((x) => x.o.number)).toEqual(['b', 'a'])
  })
})

it('employee performance keeps currencies apart', () => {
  const r = { from: '2026-01-01', to: '2026-12-31' }
  const rows = employeePerformance([{ id: 'u1', name: 'Hanaa' }], r, {
    companies: [], quotes: [], stages: [{ id: 'w', name: 'Won', sort_order: 1, is_won: true, is_lost: false, archived_at: null }],
    opps: [{ owner_id: 'u1', stage_id: 'w', closed_at: '2026-04-01T00:00:00Z' }],
    orders: [order({}), order({ currency: 'EUR' })],
  })
  expect(rows[0]).toMatchObject({ dealsWon: 1, orders: 2 })
  expect(rows[0].revenue).toHaveLength(2)
})

it('season wraps over the new year', () => {
  expect(inSeason(1, 11, 3)).toBe(true)
  expect(inSeason(6, 11, 3)).toBe(false)
  expect(inSeason(6, null, 3)).toBe(false)
})
