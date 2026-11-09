import { describe, expect, it } from 'vitest'
import { cartonsToUnit, computeLine, computePlan, maxCartonsFor, type ContainerLimits, type PlanLine } from './planner'

// Numbers for the TEST only (not business data).
const box: ContainerLimits = { maxPallets: 20, maxPayloadKg: 26000, emptyPalletKg: 20, isReefer: true, count: 1 }
const A: PlanLine = { name: 'A', productType: 'frozen', netKg: 10, grossKg: 10.6, cpp: 100, qtyUnit: 'pallets', quantity: 8, pricePerTon: 1000 }
const B: PlanLine = { name: 'B', productType: 'frozen', netKg: 10, grossKg: 10.5, cpp: 90, qtyUnit: 'tons', quantity: 20, pricePerTon: 900 }

describe('computeLine', () => {
  it('pallets → cartons, net, gross incl. empty pallets, value', () => {
    const r = computeLine(A, 20)
    expect(r.cartons).toBe(800)
    expect(r.palletSpots).toBe(8)
    expect(r.netKg).toBe(8000)
    expect(r.grossKg).toBeCloseTo(8480 + 160)
    expect(r.value).toBeCloseTo(8000)
  })
  it('tons → cartons (rounded up) and partial pallets take a full place', () => {
    const r = computeLine(B, 20)
    expect(r.cartons).toBe(2000)
    expect(r.pallets).toBeCloseTo(22.222, 3)
    expect(r.palletSpots).toBe(23)
  })
  it('tons that do not divide evenly round UP to whole cartons', () => {
    expect(computeLine({ ...B, quantity: 1.005 }, 0).cartons).toBe(101)
  })
  it('cartons unit', () => {
    const r = computeLine({ ...A, qtyUnit: 'cartons', quantity: 150 }, 0)
    expect(r.pallets).toBe(1.5)
    expect(r.palletSpots).toBe(2)
  })
  it('missing data is reported, not guessed', () => {
    const r = computeLine({ ...B, netKg: null }, 0)
    expect(r.ok).toBe(false)
    expect(r.cartons).toBeNull()
    expect(r.problems.join(' ')).toMatch(/Net kg/)
    expect(computeLine({ ...A, cpp: null }, 0).problems.join(' ')).toMatch(/Cartons per pallet/)
  })
  it('missing gross weight falls back to net and says so', () => {
    const r = computeLine({ ...A, grossKg: null }, 0)
    expect(r.usedNetAsGross).toBe(true)
    expect(r.grossKg).toBe(8000)
  })
})

describe('computePlan', () => {
  it('flags over capacity for a mixed plan', () => {
    const r = computePlan([A, B], box)
    expect(r.palletSpots).toBe(31)
    expect(r.warnings.some((w) => w.level === 'error' && /Over capacity/.test(w.text))).toBe(true)
    expect(r.value).toBeCloseTo(8000 + 18000)
  })
  it('multiple containers multiply the capacity', () => {
    const r = computePlan([A, B], { ...box, count: 2 })
    expect(r.capacity.pallets).toBe(40)
    expect(r.warnings.some((w) => /Over capacity/.test(w.text))).toBe(false)
  })
  it('flags over weight', () => {
    const heavy = { ...A, netKg: 20, grossKg: 21, cpp: 70, quantity: 20 }
    expect(computePlan([heavy], box).warnings.some((w) => /Over weight/.test(w.text))).toBe(true)
  })
  it('warns on fresh + frozen and on a dry container', () => {
    const w = computePlan([A, { ...A, productType: 'fresh' }], { ...box, isReefer: false }).warnings.map((x) => x.text).join(' | ')
    expect(w).toMatch(/Fresh and frozen/)
    expect(w).toMatch(/dry/)
  })
  it('no container chosen is an error', () => {
    expect(computePlan([A], null).warnings[0].text).toMatch(/Choose a container/)
  })
})

describe('fill remaining space', () => {
  it('limited by pallet places', () => {
    expect(maxCartonsFor(0, [A], box)).toBe(2000) // 20 pallets x 100
  })
  it('limited by weight, allowing a partial last pallet', () => {
    const heavy = { ...A, netKg: 20, grossKg: 21, cpp: 70 }
    const c = maxCartonsFor(0, [heavy], box)!
    expect(c).toBe(1220)
    // check: 1220 x 21 + 18 pallets x 20 = 25,980 kg ≤ 26,000
    expect(computePlan([{ ...heavy, qtyUnit: 'cartons', quantity: c }], box).grossKg).toBeLessThanOrEqual(26000)
    expect(computePlan([{ ...heavy, qtyUnit: 'cartons', quantity: c + 1 }], box).grossKg).toBeGreaterThan(26000)
  })
  it('takes the other products into account', () => {
    expect(maxCartonsFor(1, [A, { ...B, qtyUnit: 'pallets', quantity: 1 }], box)).toBe(12 * 90)
  })
  it('converts back to the line unit', () => {
    expect(cartonsToUnit(2000, B)).toBe(20)
    expect(cartonsToUnit(1800, { ...B, qtyUnit: 'pallets' })).toBe(20)
  })
})
