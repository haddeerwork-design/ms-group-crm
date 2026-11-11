import { supabase } from './supabase'

// ---------------------------------------------------------------------
// Official trade statistics (UN Comtrade, via the trade-data Edge Function)
// and ready-made searches for finding importers.
// Products are identified by their HS code (the customs code used worldwide).
// ---------------------------------------------------------------------

/** HS codes for what MS El-brancy sells. Comtrade shows the official name next to each result. */
export const HS_PRODUCTS: { code: string; label: string }[] = [
  { code: '080450', label: 'Mangoes & guavas (fresh)' },
  { code: '080440', label: 'Avocados (fresh)' },
  { code: '080410', label: 'Dates' },
  { code: '080510', label: 'Oranges (fresh)' },
  { code: '080521', label: 'Mandarins & tangerines (fresh)' },
  { code: '080550', label: 'Lemons & limes (fresh)' },
  { code: '080540', label: 'Grapefruit (fresh)' },
  { code: '080610', label: 'Grapes (fresh)' },
  { code: '081010', label: 'Strawberries (fresh)' },
  { code: '081020', label: 'Raspberries & blackberries (fresh)' },
  { code: '081040', label: 'Blueberries & cranberries (fresh)' },
  { code: '081090', label: 'Other fresh fruit (pomegranate, dragon fruit, passion fruit, lychee…)' },
  { code: '070310', label: 'Onions & shallots (fresh)' },
  { code: '070390', label: 'Leeks & spring onions (fresh)' },
  { code: '070320', label: 'Garlic (fresh)' },
  { code: '071420', label: 'Sweet potatoes' },
  { code: '070190', label: 'Potatoes (fresh)' },
  { code: '070200', label: 'Tomatoes (fresh)' },
  { code: '070511', label: 'Iceberg / head lettuce (fresh)' },
  { code: '070960', label: 'Peppers & chillies (fresh)' },
  { code: '081110', label: 'Strawberries (frozen)' },
  { code: '081190', label: 'Other fruit (frozen, e.g. mango)' },
  { code: '071080', label: 'Other vegetables (frozen, e.g. okra, molokhia)' },
  { code: '071090', label: 'Mixed vegetables (frozen)' },
  { code: '200799', label: 'Jams & fruit jellies' },
]
export const hsLabel = (code: string) => HS_PRODUCTS.find((x) => x.code === code)?.label ?? `HS ${code}`

/** Used until the full country list loads (codes are UN M49 as used by Comtrade). */
export const FALLBACK_COUNTRIES: { code: string; name: string }[] = [
  { code: '784', name: 'United Arab Emirates' }, { code: '682', name: 'Saudi Arabia' }, { code: '414', name: 'Kuwait' }, { code: '634', name: 'Qatar' },
  { code: '48', name: 'Bahrain' }, { code: '512', name: 'Oman' }, { code: '400', name: 'Jordan' }, { code: '422', name: 'Lebanon' },
  { code: '826', name: 'United Kingdom' }, { code: '276', name: 'Germany' }, { code: '528', name: 'Netherlands' }, { code: '56', name: 'Belgium' },
  { code: '724', name: 'Spain' }, { code: '643', name: 'Russian Federation' }, { code: '792', name: 'Türkiye' }, { code: '156', name: 'China' },
  { code: '818', name: 'Egypt' },
]
export const EGYPT = '818'

export type TradeRow = { reporter: string; reporterCode: number; partner: string; partnerCode: number; cmd: string; cmdDesc: string; value: number | null; kg: number | null; year: number }
export type TradeQuery = { flow: 'M' | 'X'; reporter?: string | null; partner?: string | null; cmd: string; year: number }

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('trade-data', { body })
  if (error) {
    // the function sends { error } with a clear message; show it when we can
    const ctx = (error as { context?: Response }).context
    let msg = error.message
    try { const j = ctx ? await ctx.json() : null; if (j?.error) msg = j.error } catch { /* keep message */ }
    if (/not found|404|Failed to send/i.test(msg)) msg = 'The trade-data function is not set up yet in Supabase (Edge Functions).'
    throw new Error(msg)
  }
  return data as T
}
export const fetchTrade = (q: TradeQuery) => call<{ rows: TradeRow[]; source: string; url: string }>({ action: 'flows', ...q })
export async function fetchCountries(): Promise<{ code: string; name: string }[]> {
  try { const c = sessionStorage.getItem('ms_trade_countries'); if (c) return JSON.parse(c) } catch { /* ignore */ }
  const r = await call<{ countries: { code: string; name: string }[] }>({ action: 'reporters' })
  const list = r.countries.filter((x) => x.code !== '0').sort((a, b) => a.name.localeCompare(b.name))
  try { sessionStorage.setItem('ms_trade_countries', JSON.stringify(list)) } catch { /* ignore */ }
  return list
}

/** Rows grouped by a key (country or product), largest value first, with each one's share. */
export function rank(rows: TradeRow[], by: 'reporter' | 'partner' | 'cmd', top = 20) {
  const m = new Map<string, { key: string; label: string; code: number | string; value: number; kg: number }>()
  for (const r of rows) {
    if (by === 'partner' && r.partnerCode === 0) continue // the world total is not a supplier
    const key = by === 'cmd' ? r.cmd : String(by === 'reporter' ? r.reporterCode : r.partnerCode)
    const label = by === 'cmd' ? r.cmdDesc : by === 'reporter' ? r.reporter : r.partner
    const e = m.get(key) ?? { key, label, code: by === 'cmd' ? r.cmd : Number(key), value: 0, kg: 0 }
    e.value += r.value ?? 0; e.kg += r.kg ?? 0
    m.set(key, e)
  }
  const all = [...m.values()].sort((a, b) => b.value - a.value)
  const total = all.reduce((s, x) => s + x.value, 0)
  const withShare = all.map((x, i) => ({ ...x, rank: i + 1, share: total ? (x.value / total) * 100 : 0, perKg: x.kg ? x.value / x.kg : null }))
  return { total, rows: withShare.slice(0, top), count: all.length, all: withShare }
}

/** Default year: two years back (the last year most countries have fully reported). */
export const defaultTradeYear = (now = new Date()) => now.getFullYear() - 2

// ---------------------------------------------------------------------
// Ready-made searches (open in a new tab). Nothing is saved automatically:
// you add the companies you choose, with their link, as research leads.
// ---------------------------------------------------------------------
const g = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`
export function importerSearches(product: string, country: string) {
  const p = product.trim(), c = country.trim()
  const both = [p, c].filter(Boolean).join(' ')
  return [
    { key: 'google', name: 'Google', what: 'Importers and distributors', url: g(`${p} importers ${c}`.trim()) },
    { key: 'google-wholesale', name: 'Google', what: 'Wholesalers and fresh-produce companies', url: g(`${p} wholesaler distributor fresh produce ${c}`.trim()) },
    { key: 'linkedin', name: 'LinkedIn', what: 'Company pages', url: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(`${p} import ${c}`.trim())}` },
    { key: 'maps', name: 'Google Maps', what: 'Companies on the map, with phone and website', url: `https://www.google.com/maps/search/${encodeURIComponent(`${p} importer ${c}`.trim())}` },
    { key: 'volza', name: 'Volza', what: 'Shipment records (buyers by name)', url: g(`site:volza.com ${both} importers`) },
    { key: 'tridge', name: 'Tridge', what: 'Buyers and market prices', url: g(`site:tridge.com ${both} buyers`) },
    { key: 'kompass', name: 'Kompass', what: 'Company directory', url: g(`site:kompass.com ${both} import`) },
    { key: 'europages', name: 'Europages', what: 'European companies', url: g(`site:europages.co.uk ${both} importer`) },
    { key: 'importyeti', name: 'ImportYeti', what: 'US importers from customs records', url: `https://www.importyeti.com/search?q=${encodeURIComponent(p)}` },
    { key: 'trademap', name: 'Trade Map (ITC)', what: 'Detailed trade figures (free account)', url: 'https://www.trademap.org/' },
  ]
}
