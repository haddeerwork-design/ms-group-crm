import { describe, expect, it } from 'vitest'
import { defaultTradeYear, importerSearches, rank, type TradeRow } from './trade'

const row = (p: Partial<TradeRow>): TradeRow => ({ reporter: 'UAE', reporterCode: 784, partner: 'World', partnerCode: 0, cmd: '080450', cmdDesc: 'Mangoes', value: 0, kg: 0, year: 2024, ...p })

describe('trade data', () => {
  it('ranks suppliers, skips the world total, gives share and price per kg', () => {
    const r = rank([
      row({ partner: 'World', partnerCode: 0, value: 999 }),
      row({ partner: 'India', partnerCode: 699, value: 600, kg: 300 }),
      row({ partner: 'Egypt', partnerCode: 818, value: 300, kg: 200 }),
      row({ partner: 'Pakistan', partnerCode: 586, value: 100, kg: null }),
    ], 'partner')
    expect(r.rows.map((x) => x.label)).toEqual(['India', 'Egypt', 'Pakistan'])
    expect(r.total).toBe(1000)
    expect(r.rows[1]).toMatchObject({ rank: 2, share: 30, perKg: 1.5 })
    expect(r.rows[2].perKg).toBeNull()
  })
  it('adds up the same country across rows', () => {
    const r = rank([row({ value: 5, kg: 1 }), row({ value: 7, kg: 1 }), row({ reporter: 'KSA', reporterCode: 682, value: 3 })], 'reporter')
    expect(r.rows[0]).toMatchObject({ label: 'UAE', value: 12, kg: 2 })
  })
  it('default year is two years back', () => {
    expect(defaultTradeYear(new Date('2026-11-11'))).toBe(2024)
  })
  it('search links carry the product and the country', () => {
    const s = importerSearches('Mango', 'United Arab Emirates')
    expect(s.find((x) => x.key === 'google')!.url).toContain(encodeURIComponent('Mango importers United Arab Emirates'))
    expect(s.every((x) => x.url.startsWith('https://'))).toBe(true)
  })
})
