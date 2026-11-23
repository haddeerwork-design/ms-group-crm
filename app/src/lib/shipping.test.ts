import { describe, expect, it } from 'vitest'
import {
  basesFor, calcFreightPerTon, freightFromRate, freightLineLabel, needsShipping, quoteFreight, ratesFor, sellerPaysFreight, shippingNote, type SavedRate,
} from './shipping'

describe('which Incoterms need shipping', () => {
  it('EXW has no shipping; FOB has a mode but the buyer pays freight; CIF we pay', () => {
    expect(needsShipping('EXW')).toBe(false)
    expect(needsShipping('FOB')).toBe(true)
    expect(sellerPaysFreight('FOB')).toBe(false)
    expect(sellerPaysFreight('CIF')).toBe(true)
    expect(sellerPaysFreight('CPT')).toBe(true)
    expect(sellerPaysFreight(null)).toBe(false)
  })
  it('air is never per container', () => {
    expect(basesFor('air')).not.toContain('per_container')
    expect(basesFor('sea')[0]).toBe('per_container')
  })
})

describe('quoteFreight', () => {
  it('per kg: per ton always, total once the weight is known', () => {
    expect(quoteFreight({ basis: 'per_kg', rate: 1.2, fx: 1, containers: null, netKg: 2000 })).toEqual({ perTon: 1200, total: 2400, missing: null })
    const r = quoteFreight({ basis: 'per_kg', rate: 1.2, fx: 1, containers: null, netKg: null })
    expect(r.perTon).toBe(1200); expect(r.total).toBeNull(); expect(r.missing).toMatch(/quantity/)
  })
  it('per container: rate × containers, spread over the tons', () => {
    expect(quoteFreight({ basis: 'per_container', rate: 3000, fx: 1, containers: 2, netKg: 48000 })).toEqual({ total: 6000, perTon: 125, missing: null })
    expect(quoteFreight({ basis: 'per_container', rate: 3000, fx: 1, containers: null, netKg: 48000 }).missing).toMatch(/containers/)
  })
  it('total, converted to the quotation currency', () => {
    expect(quoteFreight({ basis: 'total', rate: 1000, fx: 1.1, containers: null, netKg: 10000 })).toEqual({ total: 1100, perTon: 110, missing: null })
    expect(quoteFreight({ basis: 'total', rate: 1000, fx: null, containers: null, netKg: 10000 }).missing).toMatch(/exchange rate/)
  })
  it('nothing typed: nothing to show, nothing missing', () => {
    expect(quoteFreight({ basis: null, rate: null, fx: 1, containers: null, netKg: null })).toEqual({ total: null, perTon: null, missing: null })
  })
})

describe('calculator freight', () => {
  it('converts what the forwarder quoted into per ton', () => {
    expect(calcFreightPerTon('ton', 90, null)).toBe(90)
    expect(calcFreightPerTon('kg', 1.5, null)).toBe(1500)
    expect(calcFreightPerTon('container', 3000, 24)).toBe(125)
    expect(calcFreightPerTon('shipment', 3000, null)).toBeNull()
  })
})

const rate = (p: Partial<SavedRate>): SavedRate => ({
  id: 'r', mode: 'sea', rate_per_container: 3000, rate_per_kg: null, additional_fees: null, currency: 'USD',
  destination_country: 'Saudi Arabia', destination_port: 'Jeddah', container_type: "40' Reefer", carrier: null, valid_until: null, archived_at: null, ...p,
})
describe('saved rates', () => {
  it('sea rates are per container (fees added), air per kg', () => {
    expect(freightFromRate(rate({ additional_fees: 150 }))).toEqual({ basis: 'per_container', rate: 3150, currency: 'USD' })
    expect(freightFromRate(rate({ mode: 'air', rate_per_container: null, rate_per_kg: 1.4 }))).toEqual({ basis: 'per_kg', rate: 1.4, currency: 'USD' })
  })
  it('lists the destination first and leaves out expired, archived and other modes', () => {
    const list = ratesFor([
      rate({ id: 'uk', destination_country: 'United Kingdom', destination_port: 'London' }),
      rate({ id: 'ksa' }),
      rate({ id: 'old', valid_until: '2020-01-01' }),
      rate({ id: 'gone', archived_at: '2026-01-01' }),
      rate({ id: 'air', mode: 'air', rate_per_kg: 1, rate_per_container: null }),
      rate({ id: 'land', mode: 'inland' }),
    ], 'sea', 'Jeddah', '2026-11-23')
    expect(list.map((r) => r.id)).toEqual(['ksa', 'uk'])
    expect(ratesFor([rate({ id: 'land', mode: 'inland' })], 'land', '').map((r) => r.id)).toEqual(['land'])
  })
})

describe('printed text', () => {
  it('line label', () => {
    expect(freightLineLabel('en', 'sea', 'per_container', 2, 'Jeddah')).toBe('Sea freight (2 × container) to Jeddah')
    expect(freightLineLabel('ar', 'air', 'per_kg', null, null)).toBe('الشحن الجوي')
  })
  it('note under the table', () => {
    expect(shippingNote('en', { mode: 'air', basis: 'per_kg', rateText: '1.2$', display: 'line', destination: 'Dubai', paysFreight: true })).toBe('Freight by air to Dubai: 1.2$ per kg.')
    expect(shippingNote('ar', { mode: 'sea', basis: 'per_container', rateText: '3,000$', display: 'in_prices', destination: 'جدة', paysFreight: true })).toBe('الأسعار شاملة الشحن البحري حتى جدة.')
    expect(shippingNote('en', { mode: 'sea', basis: null, rateText: null, display: 'line', destination: null, paysFreight: false })).toBe('Shipping: by sea.')
    expect(shippingNote('ar', { mode: 'land', basis: 'total', rateText: '900$', display: 'line', destination: null, paysFreight: true })).toBe('الشحن البري: 900$ إجمالي الشحنة.')
  })
})

describe('place names follow the mode', async () => {
  const { placeLabel, placeSuggestions } = await import('./shipping')
  it('labels', () => {
    expect(placeLabel('air')).toBe('Destination airport')
    expect(placeLabel('sea')).toBe('Destination port')
    expect(placeLabel('')).toBe('Destination')
    expect(placeLabel('air', 'from')).toBe('Airport of departure')
  })
  it('suggests the places of your saved rates for that mode only', () => {
    const list = placeSuggestions([
      rate({ destination_port: 'Jeddah' }), rate({ id: 'x', destination_port: 'Jeddah' }),
      rate({ mode: 'air', destination_port: 'DXB', destination_country: 'UAE' }), rate({ destination_port: null, destination_country: 'Oman' }),
    ], 'sea')
    expect(list).toEqual(['Jeddah, Saudi Arabia', 'Oman'])
  })
})
