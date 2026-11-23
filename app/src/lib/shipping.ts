// Shipping on quotations and in the calculator. Pure functions, covered by shipping.test.ts.
import { INCOTERM_COMPONENTS, type Incoterm } from './pricing'

export type ShipMode = 'sea' | 'air' | 'land'
export const SHIP_MODES: ShipMode[] = ['sea', 'air', 'land']
export const SHIP_MODE_LABEL: Record<ShipMode, string> = { sea: 'Sea', air: 'Air', land: 'Land' }
/** How the freight amount is typed on a quotation. */
export type FreightBasis = 'per_kg' | 'per_container' | 'total'
/** Where the freight shows on the printed quotation. */
export type FreightDisplay = 'line' | 'in_prices'

/** EXW: the buyer collects from us, so there is no shipping to choose. */
export const needsShipping = (incoterm: Incoterm | null | undefined) => !!incoterm && incoterm !== 'EXW'
/** Under CFR, CIF, CPT, CIP, DAP, DDP we pay the main freight, so its cost belongs in the quotation. */
export const sellerPaysFreight = (incoterm: Incoterm | null | undefined) => !!incoterm && INCOTERM_COMPONENTS[incoterm].includes('freight')
/** FOB, CFR and CIF are sea terms; the others fit any mode. */
export const seaOnlyTerm = (incoterm: Incoterm | null | undefined) => incoterm === 'FOB' || incoterm === 'CFR' || incoterm === 'CIF'

/** The bases that make sense for each mode: air is charged per kg, sea and land per container or truck. */
export function basesFor(mode: ShipMode): FreightBasis[] {
  return mode === 'air' ? ['per_kg', 'total'] : ['per_container', 'per_kg', 'total']
}
export function defaultBasis(mode: ShipMode): FreightBasis {
  return mode === 'air' ? 'per_kg' : 'per_container'
}

const pos = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v) && v > 0
const r2 = (v: number) => Math.round(v * 100) / 100

export type FreightInput = {
  basis: FreightBasis | null
  rate: number | null          // as typed, in the freight currency
  fx: number | null            // 1 freight currency = fx quotation currency (1 when the same)
  containers: number | null    // per_container only
  netKg: number | null         // total net kg of the quotation (null when a quantity is missing)
}
export type FreightResult = {
  /** Freight for the whole quotation, in the quotation currency (null when it cannot be known yet). */
  total: number | null
  /** Freight per net ton, in the quotation currency (null when it cannot be known yet). */
  perTon: number | null
  /** What is missing, in plain words. */
  missing: string | null
}

/** Freight for a quotation, from what was typed. */
export function quoteFreight(i: FreightInput): FreightResult {
  if (!i.basis || !pos(i.rate)) return { total: null, perTon: null, missing: i.basis ? 'Enter the freight amount.' : null }
  if (!pos(i.fx)) return { total: null, perTon: null, missing: 'Enter the exchange rate for the freight currency.' }
  const tons = pos(i.netKg) ? i.netKg / 1000 : null
  const rate = i.rate * i.fx
  if (i.basis === 'per_kg') {
    return { perTon: r2(rate * 1000), total: tons ? r2(rate * 1000 * tons) : null, missing: tons ? null : 'Enter the quantity of every product to see the freight total.' }
  }
  if (i.basis === 'per_container' && !pos(i.containers)) return { total: null, perTon: null, missing: 'Enter how many containers.' }
  const total = r2(i.basis === 'per_container' ? rate * i.containers! : rate)
  return { total, perTon: tons ? r2(total / tons) : null, missing: tons ? null : 'Enter the quantity of every product to spread the freight per ton.' }
}

/** Freight per ton in the calculator, from the way the forwarder quoted it. */
export type CalcFreightUnit = 'ton' | 'kg' | 'container' | 'shipment'
export function calcFreightPerTon(unit: CalcFreightUnit, amount: number | null, tons: number | null): number | null {
  if (!pos(amount)) return null
  if (unit === 'ton') return amount
  if (unit === 'kg') return amount * 1000
  return pos(tons) ? amount / tons : null
}

/** A saved rate (Shipping & Logistics) as quotation freight. */
export type SavedRate = {
  id: string; mode: 'sea' | 'air' | 'inland'; rate_per_container: number | null; rate_per_kg: number | null
  additional_fees: number | null; currency: string; destination_country: string; destination_port: string | null
  container_type: string | null; carrier: string | null; valid_until: string | null; archived_at: string | null
}
export const modeOfRate = (m: SavedRate['mode']): ShipMode => (m === 'inland' ? 'land' : m)
export function freightFromRate(r: SavedRate): { basis: FreightBasis; rate: number; currency: string } | null {
  if (r.mode !== 'air' && pos(r.rate_per_container)) {
    // extra fees on sea / land rates are per container
    return { basis: 'per_container', rate: r2(r.rate_per_container + (r.additional_fees ?? 0)), currency: r.currency }
  }
  if (pos(r.rate_per_kg)) return { basis: 'per_kg', rate: r.rate_per_kg, currency: r.currency }
  return null
}
/** Saved rates for this mode, the ones for the destination first; expired and archived ones left out. */
export function ratesFor(rates: SavedRate[], mode: ShipMode, destination: string, today = new Date().toISOString().slice(0, 10)) {
  const d = destination.trim().toLowerCase()
  const hit = (r: SavedRate) => !!d && [r.destination_country, r.destination_port ?? ''].some((x) => x && (x.toLowerCase().includes(d) || d.includes(x.toLowerCase())))
  return rates
    .filter((r) => !r.archived_at && modeOfRate(r.mode) === mode && (!r.valid_until || r.valid_until >= today) && freightFromRate(r))
    .sort((a, b) => Number(hit(b)) - Number(hit(a)) || a.destination_country.localeCompare(b.destination_country))
}

// ---------------------------------------------------------------------
// Printed text
// ---------------------------------------------------------------------
type Lang = 'en' | 'ar'
const MODE_WORD: Record<Lang, Record<ShipMode, string>> = {
  en: { sea: 'sea', air: 'air', land: 'land' },
  ar: { sea: 'البحري', air: 'الجوي', land: 'البري' },
}
const BY: Record<Lang, Record<ShipMode, string>> = {
  en: { sea: 'By sea', air: 'By air', land: 'By land' },
  ar: { sea: 'بحري', air: 'جوي', land: 'بري' },
}

/** Name of the freight line in the table, e.g. "Sea freight (2 × container)". */
export function freightLineLabel(lang: Lang, mode: ShipMode, basis: FreightBasis | null, containers: number | null, destination: string | null) {
  const n = basis === 'per_container' && pos(containers) ? containers : null
  if (lang === 'ar') return `الشحن ${MODE_WORD.ar[mode]}${n ? ` (${n} حاوية)` : ''}${destination ? ` حتى ${destination}` : ''}`
  const word = mode === 'sea' ? 'Sea' : mode === 'air' ? 'Air' : 'Land'
  return `${word} freight${n ? ` (${n} × container)` : ''}${destination ? ` to ${destination}` : ''}`
}

/** The shipping sentence printed under the products table. */
export function shippingNote(lang: Lang, q: {
  mode: ShipMode; basis: FreightBasis | null; rateText: string | null; display: FreightDisplay; destination: string | null; paysFreight: boolean
}): string {
  const dest = q.destination?.trim() || null
  if (!q.paysFreight || !q.basis || !q.rateText) {
    return lang === 'ar' ? `طريقة الشحن: ${BY.ar[q.mode]}.` : `Shipping: ${BY.en[q.mode].toLowerCase()}.`
  }
  if (q.display === 'in_prices') {
    return lang === 'ar'
      ? `الأسعار شاملة الشحن ${MODE_WORD.ar[q.mode]}${dest ? ` حتى ${dest}` : ''}.`
      : `Prices include ${MODE_WORD.en[q.mode]} freight${dest ? ` to ${dest}` : ''}.`
  }
  const per = lang === 'ar'
    ? { per_kg: 'للكيلو', per_container: 'للحاوية', total: 'إجمالي الشحنة' }[q.basis]
    : { per_kg: 'per kg', per_container: 'per container', total: 'for the whole shipment' }[q.basis]
  return lang === 'ar'
    ? `الشحن ${MODE_WORD.ar[q.mode]}${dest ? ` حتى ${dest}` : ''}: ${q.rateText} ${per}.`
    : `${BY.en[q.mode].replace('By', 'Freight by')}${dest ? ` to ${dest}` : ''}: ${q.rateText} ${per}.`
}
