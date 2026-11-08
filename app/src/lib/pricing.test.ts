import { describe, expect, it } from 'vitest'
import { computePrice, resolveRate, staleness, type Rate } from './pricing'

// Worked example (all numbers invented for the TEST only, not business data):
// 10 kg carton, 100 cartons/pallet → 100 cartons per ton, 1,000 kg per pallet.
// Costs in EGP: product 20/kg, packaging 15/carton, handling 5/carton,
// inland 1,000/ton, documents 500/ton. 1 EGP = 0.02 USD.
// EXW = 20,000 + 1,500 + 500 = 22,000 EGP = 440 USD/ton
// FOB = EXW + 1,000 + 500   = 23,500 EGP = 470 USD/ton
const base = {
  netWeightKg: 10, cartonsPerPallet: 100, fxRate: 0.02,
  costs: { product: 20, packaging: 15, handling: 5, inland: 1000, documentation: 500, freight: 100, insurance: 5, destination: 30, duties: 40 },
}

describe('computePrice — Incoterm cost structure', () => {
  it('EXW excludes inland, documents and everything after the port', () => {
    expect(computePrice({ ...base, incoterm: 'EXW', marginPct: 0 }).totalCostPerTon).toBeCloseTo(440)
  })
  it('FOB and FCA add inland transport and export documents', () => {
    expect(computePrice({ ...base, incoterm: 'FOB', marginPct: 0 }).totalCostPerTon).toBeCloseTo(470)
    expect(computePrice({ ...base, incoterm: 'FCA', marginPct: 0 }).totalCostPerTon).toBeCloseTo(470)
  })
  it('CFR/CPT add freight but not insurance', () => {
    expect(computePrice({ ...base, incoterm: 'CFR', marginPct: 0 }).totalCostPerTon).toBeCloseTo(570)
    expect(computePrice({ ...base, incoterm: 'CPT', marginPct: 0 }).totalCostPerTon).toBeCloseTo(570)
  })
  it('CIF/CIP add freight and insurance', () => {
    expect(computePrice({ ...base, incoterm: 'CIF', marginPct: 0 }).totalCostPerTon).toBeCloseTo(575)
    expect(computePrice({ ...base, incoterm: 'CIP', marginPct: 0 }).totalCostPerTon).toBeCloseTo(575)
  })
  it('DAP adds destination charges, DDP also adds duties', () => {
    expect(computePrice({ ...base, incoterm: 'DAP', marginPct: 0 }).totalCostPerTon).toBeCloseTo(605)
    expect(computePrice({ ...base, incoterm: 'DDP', marginPct: 0 }).totalCostPerTon).toBeCloseTo(645)
  })
})

describe('computePrice — margin vs markup and units', () => {
  const r = computePrice({ ...base, incoterm: 'FOB', marginPct: 20 })
  it('price from a 20% margin = cost / 0.8', () => {
    expect(r.pricePerTon).toBeCloseTo(587.5)
    expect(r.grossProfitPerTon).toBeCloseTo(117.5)
    expect(r.marginPct).toBeCloseTo(20)
    expect(r.markupPct).toBeCloseTo(25) // markup is NOT the same as margin
  })
  it('converts per ton to per kg, carton and pallet', () => {
    expect(r.per.price.kg).toBeCloseTo(0.5875)
    expect(r.per.price.carton).toBeCloseTo(5.875)
    expect(r.per.price.pallet).toBeCloseTo(587.5)
    expect(r.per.cost.carton).toBeCloseTo(4.7)
    expect(r.cartonsPerTon).toBeCloseTo(100)
    expect(r.kgPerPallet).toBe(1000)
  })
  it('a fixed price overrides the margin and shows the resulting margin', () => {
    const f = computePrice({ ...base, incoterm: 'FOB', marginPct: 20, pricePerTon: 500 })
    expect(f.pricePerTon).toBe(500)
    expect(f.marginPct).toBeCloseTo(6)       // 30 / 500
    expect(f.markupPct).toBeCloseTo(6.383, 2) // 30 / 470
  })
  it('selling below cost gives a negative margin', () => {
    expect(computePrice({ ...base, incoterm: 'FOB', pricePerTon: 400 }).marginPct).toBeCloseTo(-17.5)
  })
})

describe('computePrice — missing data is reported, never guessed', () => {
  it('per-carton costs need the carton weight', () => {
    const r = computePrice({ ...base, netWeightKg: null, incoterm: 'FOB', marginPct: 10 })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/net weight per carton/)
    expect(r.per.price.carton).toBeNull()
  })
  it('costs in another currency need an exchange rate', () => {
    const r = computePrice({ ...base, fxRate: null, incoterm: 'CFR', marginPct: 10 })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/exchange rate/)
    // freight is already in the selling currency, so it is still counted
    expect(r.totalCostPerTon).toBeCloseTo(100)
  })
  it('margin of 100% or more is rejected', () => {
    expect(computePrice({ ...base, incoterm: 'FOB', marginPct: 100 }).pricePerTon).toBeNull()
  })
  it('pallet price needs cartons per pallet', () => {
    expect(computePrice({ ...base, cartonsPerPallet: null, incoterm: 'FOB', marginPct: 0 }).per.price.pallet).toBeNull()
  })
})

describe('resolveRate', () => {
  const rates: Rate[] = [
    { base_currency: 'USD', quote_currency: 'EGP', rate: 50, source: 'manual', rate_at: '2026-11-08T08:00:00Z' },
    { base_currency: 'USD', quote_currency: 'EUR', rate: 0.9, source: 'api', rate_at: '2026-11-07T08:00:00Z' },
  ]
  it('direct, inverse and same currency', () => {
    expect(resolveRate('USD', 'EGP', rates)?.rate).toBe(50)
    expect(resolveRate('EGP', 'USD', rates)?.rate).toBeCloseTo(0.02)
    expect(resolveRate('EUR', 'EUR', rates)?.rate).toBe(1)
  })
  it('cross rate through USD keeps the OLDER timestamp', () => {
    const r = resolveRate('EGP', 'EUR', rates)!
    expect(r.rate).toBeCloseTo(0.018)
    expect(r.rate_at).toBe('2026-11-07T08:00:00Z')
    expect(r.path).toBe('EGP→USD→EUR')
  })
  it('returns null when no rate exists', () => {
    expect(resolveRate('GBP', 'EGP', rates)).toBeNull()
  })
  it('staleness bands', () => {
    const now = new Date('2026-11-08T12:00:00Z')
    expect(staleness('2026-11-08T08:00:00Z', now)).toBe('fresh')
    expect(staleness('2026-11-06T13:00:00Z', now)).toBe('old')
    expect(staleness('2026-11-01T08:00:00Z', now)).toBe('stale')
  })
})
