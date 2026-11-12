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

import { basisPerTon, convertBasis, lineTotal } from './quotations'
describe('price per ton / kg / carton / pallet', () => {
  it('converts', () => {
    expect(convertBasis(1250, 'ton', 'kg', 10, 100)).toBe(1.25)
    expect(convertBasis(1250, 'ton', 'unit', 10, 100)).toBe(12.5)
    expect(convertBasis(1250, 'ton', 'pallet', 10, 100)).toBe(1250)
    expect(convertBasis(12.5, 'unit', 'ton', 10, null)).toBe(1250)
    expect(basisPerTon('pallet', 10, null)).toBeNull()
  })
  it('totals', () => {
    expect(lineTotal({ quantity: 2, quantity_unit: 'tons', net_weight_kg: 10, cartons_per_pallet: 100, price_per_ton: 1250, price_basis: 'kg', unit_price: 1.25 })).toBe(2500)
    expect(lineTotal({ quantity: 3, quantity_unit: 'pallets', net_weight_kg: 10, cartons_per_pallet: 100, price_per_ton: 1250, price_basis: 'pallet', unit_price: 1250 })).toBe(3750)
    expect(lineTotal({ quantity: 200, quantity_unit: 'cartons', net_weight_kg: 10, cartons_per_pallet: 100, price_per_ton: 1250, price_basis: 'pallet', unit_price: 1250 })).toBe(2500)
  })
})
