// Countries and their sea ports / airports, for the destination of a quotation.
// The lists come from public data (UN/LOCODE ports, OurAirports airports); see scripts/build-places.py.
// They are suggestions only: any name can still be typed.
import { useEffect, useState } from 'react'
import { PLACE_COUNTRIES } from './place-countries'

type Lang = 'en' | 'ar'
const names: Partial<Record<Lang, Intl.DisplayNames | null>> = {}
function display(lang: Lang) {
  if (!(lang in names)) { try { names[lang] = new Intl.DisplayNames([lang], { type: 'region' }) } catch { names[lang] = null } }
  return names[lang]
}
/** "AE" → "United Arab Emirates" / "الإمارات العربية المتحدة". */
export function countryName(code: string, lang: Lang = 'en'): string {
  try { return display(lang)?.of(code) ?? code } catch { return code }
}
/** Countries that have ports or airports in the lists, sorted by name in the page language. */
export function countryOptions(lang: Lang = 'en') {
  return PLACE_COUNTRIES.map((code) => ({ code, name: countryName(code, lang) }))
    .filter((c) => c.name !== c.code)
    .sort((a, b) => a.name.localeCompare(b.name, lang))
}
const ALIAS: Record<string, string> = { uae: 'AE', emirates: 'AE', ksa: 'SA', usa: 'US', us: 'US', uk: 'GB', england: 'GB', 'great britain': 'GB', holland: 'NL', russia: 'RU' }
const norm = (s: string) => s.trim().toLowerCase().replace(/[.‏‎]/g, '').replace(/[أإآ]/g, 'ا').replace(/^the /, '')
let byName: Map<string, string> | null = null
/** A typed country ("Saudi Arabia", "السعودية", "KSA", "ae") → its code, or null. */
export function countryFromText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null
  const t = norm(text)
  if (/^[a-z]{2}$/.test(t) && (PLACE_COUNTRIES as readonly string[]).includes(t.toUpperCase())) return t.toUpperCase()
  if (ALIAS[t]) return ALIAS[t]
  if (!byName) {
    byName = new Map()
    for (const code of PLACE_COUNTRIES) for (const l of ['en', 'ar'] as const) byName.set(norm(countryName(code, l)), code)
    // short Arabic names people write
    for (const [k, v] of Object.entries({ 'السعودية': 'SA', 'السعوديه': 'SA', 'الامارات': 'AE', 'امريكا': 'US', 'بريطانيا': 'GB', 'هولندا': 'NL', 'المانيا': 'DE', 'روسيا': 'RU' })) byName.set(k, v)
  }
  return byName.get(t) ?? null
}

export type Places = { sea: string[]; air: string[] }
const cache = new Map<string, Promise<Places>>()
export function loadPlaces(code: string): Promise<Places> {
  if (!cache.has(code)) {
    cache.set(code, fetch(`${import.meta.env.BASE_URL}places/${code}.json`)
      .then((r) => (r.ok ? r.json() as Promise<Places> : { sea: [], air: [] }))
      .catch(() => { cache.delete(code); return { sea: [], air: [] } }))
  }
  return cache.get(code)!
}
/** The ports and airports of a country (null while loading or when no country is chosen). */
export function usePlaces(code: string | null | undefined): Places | null {
  const [p, setP] = useState<{ code: string; places: Places } | null>(null)
  useEffect(() => {
    if (!code) return
    let on = true
    loadPlaces(code).then((places) => { if (on) setP({ code, places }) })
    return () => { on = false }
  }, [code])
  return code && p?.code === code ? p.places : null
}
