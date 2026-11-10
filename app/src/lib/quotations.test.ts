import { describe, expect, it } from 'vitest'
import { addDays, fmtPrice, lineTons, lineTotal, renderPolicy } from './quotations'

describe('quotation lines', () => {
  it('tons, cartons and pallets to net tons', () => {
    expect(lineTons({ quantity: 12, quantity_unit: 'tons', net_weight_kg: null, cartons_per_pallet: null })).toBe(12)
    expect(lineTons({ quantity: 500, quantity_unit: 'cartons', net_weight_kg: 10, cartons_per_pallet: null })).toBe(5)
    expect(lineTons({ quantity: 2, quantity_unit: 'pallets', net_weight_kg: 10, cartons_per_pallet: 100 })).toBe(2)
    expect(lineTons({ quantity: 2, quantity_unit: 'pallets', net_weight_kg: 10, cartons_per_pallet: null })).toBeNull()
  })
  it('line total = net tons × price per ton', () => {
    expect(lineTotal({ quantity: 500, quantity_unit: 'cartons', net_weight_kg: 4, cartons_per_pallet: null, price_per_ton: 820 })).toBe(1640)
    expect(lineTotal({ quantity: null, quantity_unit: null, net_weight_kg: 4, cartons_per_pallet: null, price_per_ton: 820 })).toBeNull()
  })
})

describe('policy and formatting', () => {
  it('fills placeholders', () => {
    expect(renderPolicy(['valid {validity_days} days', '{incoterm} until order', 'from {production_time}'],
      { validity_days: 3, incoterm: 'CIF', production_time: '7 days to 10 days' }))
      .toEqual(['valid 3 days', 'CIF until order', 'from 7 days to 10 days'])
  })
  it('valid until date and price format like the PDF', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(fmtPrice(1200, 'USD')).toBe('1,200$')
    expect(fmtPrice(950.5, 'EGP')).toBe('950.5 EGP')
  })
})

describe('per-unit prices (jars)', () => {
  it('total from units, cartons or tons', async () => {
    const { lineTotal, unitToTon, unitsLabel } = await import('./quotations')
    const jar = { net_weight_kg: 0.16, cartons_per_pallet: null, price_per_ton: unitToTon(245, 0.16), price_basis: 'unit' as const, unit_price: 245 }
    expect(unitToTon(185, 0.16)).toBe(1156250)
    expect(lineTotal({ ...jar, quantity: 500, quantity_unit: 'units' })).toBe(122500)
    expect(lineTotal({ ...jar, quantity: 0.08, quantity_unit: 'tons' })).toBe(122500) // 80 kg = 500 jars
    expect(lineTotal({ ...jar, unit_price: null, quantity: 5, quantity_unit: 'units' })).toBeNull()
    expect(unitsLabel('jar')).toBe('jars'); expect(unitsLabel('bunch')).toBe('bunches'); expect(unitsLabel('jar', 1)).toBe('jar')
  })
})
