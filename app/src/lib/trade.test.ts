import { describe, expect, it } from 'vitest'
import { defaultTradeYear, importerSearches, rank, type TradeRow , fetchTradeAll } from './trade'

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

describe('fetchTradeAll', () => {
  const q = { flow: 'M' as const, cmd: Array.from({ length: 25 }, (_, i) => String(100000 + i)).join(','), year: 2024 }
  const row = (cmd: string) => ({ reporter: 'A', reporterCode: 1, partner: 'W', partnerCode: 0, cmd, cmdDesc: cmd, value: 1, kg: 1, year: 2024 })
  it('asks in parts one after the other, waits and retries when busy', async () => {
    let calls = 0, active = 0, maxActive = 0
    const waits: number[] = []
    const call = async (x: { cmd: string }) => {
      active++; maxActive = Math.max(maxActive, active); calls++
      try {
        if (calls === 2) throw Object.assign(new Error('Too many'), { busy: true })
        return { rows: x.cmd.split(',').map(row), source: 'UN', url: '' }
      } finally { active-- }
    }
    const r = await fetchTradeAll(q, (s) => s && waits.push(s), { call, sleep: async () => {} })
    expect(r.rows).toHaveLength(25)
    expect(maxActive).toBe(1)
    expect(waits).toEqual([4])
    // remembered: no new calls
    const before = calls
    await fetchTradeAll(q, undefined, { call, sleep: async () => {} })
    expect(calls).toBe(before)
  })
  it('gives up with a clear message after a few tries', async () => {
    const call = async () => { throw Object.assign(new Error('Too many'), { busy: true }) }
    await expect(fetchTradeAll({ ...q, year: 2023 }, undefined, { call, sleep: async () => {} })).rejects.toThrow(/busy right now/)
  })
})
