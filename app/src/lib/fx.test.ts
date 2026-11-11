import { describe, expect, it } from 'vitest'
import { parseLive } from './fx'

describe('parseLive', () => {
  it('keeps only app currencies and the publish time', () => {
    const r = parseLive({ result: 'success', time_last_update_unix: 1762819201, rates: { USD: 1, EUR: 0.86, EGP: 47.5, JPY: 150, SAR: 3.75 } })
    expect(r.rates).toEqual({ EUR: 0.86, EGP: 47.5, SAR: 3.75 })
    expect(r.at).toBe(new Date(1762819201000).toISOString())
  })
  it('rejects odd answers', () => {
    expect(() => parseLive({ result: 'error' })).toThrow()
    expect(() => parseLive({ result: 'success', time_last_update_unix: 1, rates: { JPY: 1 } })).toThrow()
  })
})
