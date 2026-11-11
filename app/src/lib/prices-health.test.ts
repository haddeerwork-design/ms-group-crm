import { describe, expect, it } from 'vitest'
import { priceHealth, priceHealthSummary } from './prices'

const T = '2026-11-11'
describe('priceHealth', () => {
  it('expired, expiring, old, ok', () => {
    expect(priceHealth({ valid_from: '2026-10-01', valid_until: '2026-11-01', source: 'app' }, T)).toEqual({ state: 'expired', days: 10 })
    expect(priceHealth({ valid_from: '2026-10-01', valid_until: '2026-11-15', source: 'app' }, T)).toEqual({ state: 'expiring', days: 4 })
    expect(priceHealth({ valid_from: '2026-11-11', valid_until: '2026-11-11', source: 'app' }, T).state).toBe('expiring')
    expect(priceHealth({ valid_from: '2026-08-01', valid_until: null, source: 'app' }, T)).toEqual({ state: 'old', days: 102 })
    expect(priceHealth({ valid_from: '2026-08-01', valid_until: null, source: 'imported' }, T).state).toBe('ok')
    expect(priceHealth({ valid_from: '2026-10-01', valid_until: '2026-12-31', source: 'app' }, T).state).toBe('ok')
  })
  it('summary counts', () => {
    expect(priceHealthSummary([
      { valid_from: '2026-10-01', valid_until: '2026-11-01', source: 'app' },
      { valid_from: '2026-08-01', valid_until: null, source: 'app' },
      { valid_from: '2026-11-01', valid_until: null, source: 'app' },
    ], T)).toEqual({ expired: 1, expiring: 0, old: 1, total: 2 })
  })
})
