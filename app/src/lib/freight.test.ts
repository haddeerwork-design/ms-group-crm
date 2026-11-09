import { describe, expect, it } from 'vitest'
import { airFreight, rateValidity, seaFreight, type FreightRate } from './freight'

// Numbers for the TEST only.
const air: FreightRate = { mode: 'air', rate_per_container: null, rate_per_kg: 2, min_charge: 150, additional_fees: 50, currency: 'USD' }
const sea: FreightRate = { mode: 'sea', rate_per_container: 2500, rate_per_kg: null, min_charge: null, additional_fees: 100, currency: 'USD' }

describe('air freight', () => {
  it('uses actual weight when heavier than volumetric', () => {
    // 100 cartons × 5 kg = 500 kg; volumetric 30×20×15/6000 = 1.5 kg × 100 = 150 kg
    const r = airFreight(air, { cartons: 100, grossKgPerCarton: 5, lengthCm: 30, widthCm: 20, heightCm: 15, divisor: 6000, netTons: 0.45 })
    expect(r.volumetricKg).toBeCloseTo(150)
    expect(r.chargeableKg).toBe(500)
    expect(r.total).toBe(1050)            // 500 × 2 + 50
    expect(r.perNetTon).toBeCloseTo(2333.33, 1)
    expect(r.ok).toBe(true)
  })
  it('uses volumetric weight for light, bulky cartons', () => {
    // 100 × 2 kg = 200 kg; volumetric 50×40×30/6000 = 10 kg × 100 = 1000 kg
    const r = airFreight(air, { cartons: 100, grossKgPerCarton: 2, lengthCm: 50, widthCm: 40, heightCm: 30, divisor: 6000, netTons: null })
    expect(r.chargeableKg).toBe(1000)
    expect(r.total).toBe(2050)
  })
  it('divisor changes the result (5000 vs 6000)', () => {
    const r = airFreight(air, { cartons: 100, grossKgPerCarton: 2, lengthCm: 50, widthCm: 40, heightCm: 30, divisor: 5000, netTons: null })
    expect(r.chargeableKg).toBe(1200)
  })
  it('minimum charge applies to small shipments', () => {
    const r = airFreight(air, { cartons: 2, grossKgPerCarton: 5, lengthCm: 30, widthCm: 20, heightCm: 15, divisor: 6000, netTons: null })
    expect(r.minApplied).toBe(true)
    expect(r.total).toBe(200)             // 150 min + 50 fees
  })
  it('missing dimensions are reported, actual weight still used', () => {
    const r = airFreight(air, { cartons: 100, grossKgPerCarton: 5, lengthCm: null, widthCm: 20, heightCm: 15, divisor: 6000, netTons: null })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/dimensions/)
    expect(r.chargeableKg).toBe(500)
  })
})

describe('sea freight', () => {
  it('rate × containers + fees per container', () => {
    const r = seaFreight(sea, { containers: 2, netTons: 40 })
    expect(r.total).toBe(5200)
    expect(r.perNetTon).toBe(130)
  })
  it('rejects fractional containers', () => {
    expect(seaFreight(sea, { containers: 1.5, netTons: null }).ok).toBe(false)
  })
})

describe('validity', () => {
  it('expired / future / valid / no date', () => {
    expect(rateValidity({ valid_from: null, valid_until: '2026-01-01' }, '2026-11-09')).toBe('expired')
    expect(rateValidity({ valid_from: '2026-12-01', valid_until: null }, '2026-11-09')).toBe('future')
    expect(rateValidity({ valid_from: null, valid_until: '2026-12-31' }, '2026-11-09')).toBe('valid')
    expect(rateValidity({ valid_from: null, valid_until: null }, '2026-11-09')).toBe('no_date')
  })
})

import { lineAmount } from './proformas'
describe('proforma line amounts', () => {
  it('converts quantity and price units', () => {
    expect(lineAmount(20, 'tons', null, 900, 'ton')).toBe(18000)
    expect(lineAmount(500, 'cartons', 4, 820, 'ton')).toBe(1640)       // 2 t
    expect(lineAmount(500, 'cartons', 4, 3.5, 'carton')).toBe(1750)
    expect(lineAmount(2, 'tons', 10, 9, 'carton')).toBe(1800)           // 200 cartons
    expect(lineAmount(1000, 'kg', null, 1.2, 'kg')).toBe(1200)
    expect(lineAmount(160, 'pieces', null, 2, 'piece')).toBe(320)
  })
  it('returns null when a conversion is impossible', () => {
    expect(lineAmount(500, 'cartons', null, 820, 'ton')).toBeNull()
    expect(lineAmount(10, 'tons', null, 2, 'piece')).toBeNull()
  })
})
