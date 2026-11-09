import { describe, expect, it } from 'vitest'
import { outstandingByCurrency, paymentStatus, safeFileName, splitSchedule, type Payment } from './orders'

const today = '2026-11-09'
const p = (x: Partial<Payment>): Payment => ({ id: Math.random().toString(), direction: 'in', kind: 'advance', order_id: null, company_id: null, supplier_id: null, forwarder_id: null, description: null,
  amount_due: 100, currency: 'USD', due_date: null, amount_paid: 0, paid_date: null, method: null, reference: null, confirmed_by: null, confirmed_at: null, cancelled_at: null, notes: null, created_at: '', ...x })

describe('payment status', () => {
  it('paid / partial / overdue / unpaid / cancelled', () => {
    expect(paymentStatus(p({ amount_paid: 100 }), today)).toBe('paid')
    expect(paymentStatus(p({ amount_paid: 40 }), today)).toBe('partial')
    expect(paymentStatus(p({ amount_paid: 40, due_date: '2026-11-01' }), today)).toBe('overdue')
    expect(paymentStatus(p({ due_date: '2026-12-01' }), today)).toBe('unpaid')
    expect(paymentStatus(p({ amount_paid: 100, cancelled_at: 'x' }), today)).toBe('cancelled')
  })
  it('outstanding per currency, ignores paid/cancelled/out', () => {
    const r = outstandingByCurrency([p({ amount_due: 9500, amount_paid: 0, due_date: '2026-11-01' }), p({ amount_due: 9500, amount_paid: 2000 }), p({ amount_paid: 100 }),
      p({ amount_due: 50, cancelled_at: 'x' }), p({ direction: 'out', amount_due: 700 }), p({ currency: 'EUR', amount_due: 300 })], 'in', today)
    expect(r).toEqual([{ currency: 'USD', outstanding: 17000, overdue: 9500, count: 2 }, { currency: 'EUR', outstanding: 300, overdue: 0, count: 1 }])
  })
})

describe('schedule split', () => {
  it('50 / 50 and 30 / 70 with rounding on the last part', () => {
    expect(splitSchedule(26190, [{ kind: 'advance', percent: 50, due_date: null }, { kind: 'balance', percent: 50, due_date: null }]).map((x) => x.amount)).toEqual([13095, 13095])
    expect(splitSchedule(100.01, [{ kind: 'advance', percent: 30, due_date: null }, { kind: 'balance', percent: 70, due_date: null }]).map((x) => x.amount)).toEqual([30, 70.01])
    const three = splitSchedule(1000, [{ kind: 'a', percent: 33.33, due_date: null }, { kind: 'b', percent: 33.33, due_date: null }, { kind: 'c', percent: 33.34, due_date: null }])
    expect(three.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(1000, 2)
  })
  it('rejects percentages that do not add up to 100', () => {
    expect(() => splitSchedule(100, [{ kind: 'a', percent: 50, due_date: null }, { kind: 'b', percent: 40, due_date: null }])).toThrow(/90%/)
  })
})

describe('file names', () => {
  it('keeps letters, numbers, dots and dashes', () => {
    expect(safeFileName('B/L copy (final) – Jeddah.pdf')).toBe('B_L_copy_final_Jeddah.pdf')
  })
})
