import { describe, expect, it } from 'vitest'
import { diff, recordLabel, recordLink } from './activity'

describe('activity log', () => {
  it('shows only real changes, without technical fields', () => {
    expect(diff({ action: 'UPDATE', old_data: { id: 1, status: 'draft', total: 10, updated_at: 'a' }, new_data: { id: 1, status: 'sent', total: 10, updated_at: 'b' } }))
      .toEqual([{ field: 'Status', before: 'draft', after: 'sent' }])
    expect(diff({ action: 'INSERT', old_data: null, new_data: { id: 1, rate: 47.5, notes: null, rate_at: '2026-11-11T08:00:00+00:00' } }))
      .toEqual([{ field: 'Rate', before: '', after: '47.5' }, { field: 'Rate at', before: '', after: '2026-11-11 08:00' }])
    expect(diff({ action: 'DELETE', old_data: { role: 'sales_officer', ok: true }, new_data: null }))
      .toEqual([{ field: 'Role', before: 'sales_officer', after: '' }, { field: 'Ok', before: 'Yes', after: '' }])
  })
  it('names and links records', () => {
    expect(recordLabel({ table_name: 'quotations', record_id: 'x', old_data: null, new_data: { number: 'Q-1' } })).toBe('Q-1')
    expect(recordLabel({ table_name: 'exchange_rates', record_id: '5', old_data: null, new_data: { base_currency: 'USD', quote_currency: 'EGP' } })).toBe('USD → EGP')
    expect(recordLabel({ table_name: 'samples', record_id: 'abcdef123456', old_data: null, new_data: {} })).toBe('#abcdef12')
    expect(recordLink({ table_name: 'payments', record_id: '1', action: 'INSERT', old_data: null, new_data: { order_id: 'o1' } })).toBe('/orders/o1')
    expect(recordLink({ table_name: 'quotations', record_id: 'q1', action: 'DELETE', old_data: {}, new_data: null })).toBeNull()
  })
})
