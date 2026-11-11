import { supabase } from './supabase'
import { CURRENCIES } from './pricing'

// Live exchange rates (free, no key): ExchangeRate-API's open endpoint, updated once a day.
export const FX_API_URL = 'https://open.er-api.com/v6/latest/USD'
export const FX_API_SOURCE = 'ExchangeRate-API (open.er-api.com)'
export const FX_AUTO_SOURCE = `${FX_API_SOURCE} · daily auto-update`
export type LiveRates = { at: string; rates: Record<string, number> }

/** Reads the service's answer; only the currencies the app uses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseLive(j: any): LiveRates {
  if (j?.result !== 'success' || !j.rates || !j.time_last_update_unix) throw new Error('Unexpected answer from the rates service')
  const rates: Record<string, number> = {}
  for (const c of CURRENCIES) if (c !== 'USD' && typeof j.rates[c] === 'number' && j.rates[c] > 0) rates[c] = j.rates[c]
  if (!Object.keys(rates).length) throw new Error('Unexpected answer from the rates service')
  return { at: new Date(j.time_last_update_unix * 1000).toISOString(), rates }
}

export async function fetchLiveRates(fetcher: typeof fetch = fetch): Promise<LiveRates> {
  const res = await fetcher(FX_API_URL)
  if (!res.ok) throw new Error(`The rates service answered ${res.status}`)
  return parseLive(await res.json())
}

const KEY = 'ms_fx_auto'
const today = () => new Date().toISOString().slice(0, 10)

/**
 * Once a day, for people allowed to edit rates: if the service has published
 * newer rates than the newest saved USD rate, save them (with their source and
 * time). Rates entered by hand are never overwritten — a newer row is added, and
 * the history keeps both. Returns how many rates were saved (0 = nothing new).
 */
export async function autoDailyRates(userId: string, fetcher: typeof fetch = fetch): Promise<number> {
  try { if (localStorage.getItem(KEY) === today()) return 0 } catch { /* private mode: still fine */ }
  const mark = () => { try { localStorage.setItem(KEY, today()) } catch { /* ignore */ } }
  const live = await fetchLiveRates(fetcher)
  const { data, error } = await supabase.from('exchange_rates').select('rate_at').eq('base_currency', 'USD')
    .in('quote_currency', Object.keys(live.rates)).order('rate_at', { ascending: false }).limit(1)
  if (error) throw error
  const newest = data?.[0]?.rate_at as string | undefined
  if (newest && new Date(newest).getTime() >= new Date(live.at).getTime()) { mark(); return 0 }
  const rows = Object.entries(live.rates).map(([quote, rate]) => ({
    base_currency: 'USD', quote_currency: quote, rate, source: FX_AUTO_SOURCE, rate_at: live.at, created_by: userId,
  }))
  const ins = await supabase.from('exchange_rates').insert(rows)
  if (ins.error) throw ins.error
  mark()
  return rows.length
}
