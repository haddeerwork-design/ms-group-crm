import { describe, expect, it } from 'vitest'
import { fromPerTon, parseAmount, roundForInput, toPerTon, unitsPerTon } from './pricing'

describe('price units', () => {
  it('converts between units', () => {
    expect(toPerTon(1.2, 'kg', null, null)).toBe(1200)
    expect(toPerTon(12, 'carton', 10, null)).toBe(1200)
    expect(toPerTon(1200, 'pallet', 10, 100)).toBe(1200)
    expect(fromPerTon(1200, 'carton', 4, null)).toBe(4.8)
    expect(unitsPerTon('carton', null, null)).toBeNull()
    expect(unitsPerTon('pallet', 10, null)).toBeNull()
  })
  it('reads typed amounts', () => {
    expect(parseAmount('1,250.5')).toBe(1250.5)
    expect(parseAmount(' ١٢٥٠ ')).toBe(1250)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(roundForInput(1.234567)).toBe('1.2346')
    expect(roundForInput(48650.456)).toBe('48650.46')
  })
})
