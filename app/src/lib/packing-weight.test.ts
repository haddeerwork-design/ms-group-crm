import { describe, expect, it } from 'vitest'
import { kgFromPacking } from './quotations'

describe('kgFromPacking', () => {
  it('reads common ways of writing a carton weight', () => {
    expect(kgFromPacking('3 Kg')).toBe(3)
    expect(kgFromPacking('10kg carton')).toBe(10)
    expect(kgFromPacking('Carton 4.5 KGS')).toBe(4.5)
    expect(kgFromPacking('10 x 1 kg')).toBe(10)
    expect(kgFromPacking('12×500 g bags')).toBe(6)
    expect(kgFromPacking('500 gm punnet')).toBe(0.5)
    expect(kgFromPacking('كرتونة ٣ كيلو')).toBe(3)
    expect(kgFromPacking('2,5 كجم')).toBe(2.5)
  })
  it('ignores text without a weight', () => {
    expect(kgFromPacking('Open top carton')).toBeNull()
    expect(kgFromPacking('')).toBeNull()
    expect(kgFromPacking('Size 12 / 14 count')).toBeNull()
  })
})
