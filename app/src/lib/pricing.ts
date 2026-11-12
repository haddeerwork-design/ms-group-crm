// Export pricing maths. Pure functions, no database access, covered by
// pricing.test.ts. All "per ton" values are per METRIC ton of NET product.

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP', 'AED', 'SAR'] as const
export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP'] as const
export type Incoterm = (typeof INCOTERMS)[number]

/** Cost components. "cost" components are entered in the cost currency;
 *  "sell" components (after the port) are entered in the selling currency. */
export const COMPONENTS = {
  product:       { label: 'Product cost',              unit: 'per kg',     ccy: 'cost' },
  packaging:     { label: 'Packaging',                 unit: 'per carton', ccy: 'cost' },
  handling:      { label: 'Handling',                  unit: 'per carton', ccy: 'cost' },
  inland:        { label: 'Inland transport',          unit: 'per ton',    ccy: 'cost' },
  documentation: { label: 'Export documents',          unit: 'per ton',    ccy: 'cost' },
  other:         { label: 'Other costs',               unit: 'per ton',    ccy: 'cost' },
  freight:       { label: 'Freight',                   unit: 'per ton',    ccy: 'sell' },
  insurance:     { label: 'Insurance',                 unit: 'per ton',    ccy: 'sell' },
  destination:   { label: 'Destination charges',       unit: 'per ton',    ccy: 'sell' },
  duties:        { label: 'Import duties & taxes',     unit: 'per ton',    ccy: 'sell' },
} as const
export type Component = keyof typeof COMPONENTS

/** Which costs the SELLER pays under each Incoterm (Incoterms 2020).
 *  Insurance is mandatory for CIF/CIP; under DAP/DDP the seller carries the
 *  risk, so insurance is counted only if you enter it. */
export const INCOTERM_COMPONENTS: Record<Incoterm, Component[]> = {
  EXW: ['product', 'packaging', 'handling', 'other'],
  FCA: ['product', 'packaging', 'handling', 'other', 'inland', 'documentation'],
  FOB: ['product', 'packaging', 'handling', 'other', 'inland', 'documentation'],
  CFR: ['product', 'packaging', 'handling', 'other', 'inland', 'documentation', 'freight'],
  CPT: ['product', 'packaging', 'handling', 'other', 'inland', 'documentation', 'freight'],
  CIF: ['product', 'packaging', 'handling', 'other', 'inland', 'documentation', 'freight', 'insurance'],
  CIP: ['product', 'packaging', 'handling', 'other', 'inland', 'documentation', 'freight', 'insurance'],
  DAP: ['product', 'packaging', 'handling', 'other', 'inland', 'documentation', 'freight', 'insurance', 'destination'],
  DDP: ['product', 'packaging', 'handling', 'other', 'inland', 'documentation', 'freight', 'insurance', 'destination', 'duties'],
}

export type PriceInput = {
  incoterm: Incoterm
  netWeightKg: number | null       // per carton
  cartonsPerPallet: number | null
  fxRate: number | null            // 1 cost currency = fxRate selling currency (1 when same currency)
  costs: Partial<Record<Component, number | null>>
  /** Either a target margin (%) or a fixed selling price per ton. */
  marginPct?: number | null
  pricePerTon?: number | null
}

export type PriceResult = {
  ok: boolean
  problems: string[]
  breakdown: { component: Component; perTon: number }[]   // selling currency
  totalCostPerTon: number | null
  pricePerTon: number | null
  per: {
    cost: { kg: number | null; carton: number | null; pallet: number | null }
    price: { kg: number | null; carton: number | null; pallet: number | null }
  }
  grossProfitPerTon: number | null
  marginPct: number | null   // profit / price
  markupPct: number | null   // profit / cost
  cartonsPerTon: number | null
  kgPerPallet: number | null
}

const pos = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v) && v > 0
const has = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v) && v !== 0

export function computePrice(i: PriceInput): PriceResult {
  const problems: string[] = []
  const net = pos(i.netWeightKg) ? i.netWeightKg : null
  const cpp = pos(i.cartonsPerPallet) ? i.cartonsPerPallet : null
  const cartonsPerTon = net ? 1000 / net : null
  const fx = pos(i.fxRate) ? i.fxRate : null
  const included = INCOTERM_COMPONENTS[i.incoterm]

  for (const [k, v] of Object.entries(i.costs)) {
    if (typeof v === 'number' && (v < 0 || !isFinite(v))) problems.push(`${COMPONENTS[k as Component].label} cannot be negative.`)
  }

  const breakdown: PriceResult['breakdown'] = []
  for (const c of included) {
    const v = i.costs[c]
    if (!has(v) || v < 0) continue
    const meta = COMPONENTS[c]
    let perTon: number
    if (meta.unit === 'per kg') perTon = v * 1000
    else if (meta.unit === 'per carton') {
      if (!cartonsPerTon) { problems.push(`${meta.label} is per carton: enter the net weight per carton.`); continue }
      perTon = v * cartonsPerTon
    } else perTon = v
    if (meta.ccy === 'cost') {
      if (!fx) { problems.push('Enter the exchange rate between the cost and selling currencies.'); continue }
      perTon *= fx
    }
    breakdown.push({ component: c, perTon })
  }

  const totalCostPerTon = breakdown.length ? breakdown.reduce((s, b) => s + b.perTon, 0) : null

  let pricePerTon: number | null = null
  if (pos(i.pricePerTon)) pricePerTon = i.pricePerTon
  else if (typeof i.marginPct === 'number' && isFinite(i.marginPct)) {
    if (i.marginPct >= 100) problems.push('Margin must be below 100%.')
    else if (totalCostPerTon != null) pricePerTon = totalCostPerTon / (1 - i.marginPct / 100)
  }

  const perUnit = (perTon: number | null) => ({
    kg: perTon == null ? null : perTon / 1000,
    carton: perTon == null || !net ? null : (perTon * net) / 1000,
    pallet: perTon == null || !net || !cpp ? null : (perTon * net * cpp) / 1000,
  })
  const profit = pricePerTon != null && totalCostPerTon != null ? pricePerTon - totalCostPerTon : null

  return {
    ok: problems.length === 0 && pricePerTon != null,
    problems: [...new Set(problems)],
    breakdown,
    totalCostPerTon,
    pricePerTon,
    per: { cost: perUnit(totalCostPerTon), price: perUnit(pricePerTon) },
    grossProfitPerTon: profit,
    marginPct: profit != null && pricePerTon ? (profit / pricePerTon) * 100 : null,
    markupPct: profit != null && totalCostPerTon ? (profit / totalCostPerTon) * 100 : null,
    cartonsPerTon,
    kgPerPallet: net && cpp ? net * cpp : null,
  }
}

// ---------------------------------------------------------------------
// Exchange rates
// ---------------------------------------------------------------------
export type Rate = { base_currency: string; quote_currency: string; rate: number; source: string; rate_at: string }
export type ResolvedRate = { rate: number; source: string; rate_at: string; path: string }

/** Finds "1 from = ? to" using saved rates: direct, inverse, or through USD.
 *  The returned rate_at is the OLDEST rate used, so staleness is never hidden. */
export function resolveRate(from: string, to: string, rates: Rate[]): ResolvedRate | null {
  if (from === to) return { rate: 1, source: 'same currency', rate_at: new Date().toISOString(), path: from }
  const direct = (a: string, b: string): ResolvedRate | null => {
    const d = rates.find((r) => r.base_currency === a && r.quote_currency === b)
    if (d) return { rate: Number(d.rate), source: d.source, rate_at: d.rate_at, path: `${a}→${b}` }
    const inv = rates.find((r) => r.base_currency === b && r.quote_currency === a)
    if (inv) return { rate: 1 / Number(inv.rate), source: inv.source, rate_at: inv.rate_at, path: `${a}→${b} (inverse)` }
    return null
  }
  const d = direct(from, to)
  if (d) return d
  if (from !== 'USD' && to !== 'USD') {
    const a = direct(from, 'USD'), b = direct('USD', to)
    if (a && b) return {
      rate: a.rate * b.rate,
      source: a.source === b.source ? a.source : `${a.source} + ${b.source}`,
      rate_at: a.rate_at < b.rate_at ? a.rate_at : b.rate_at,
      path: `${from}→USD→${to}`,
    }
  }
  return null
}

export function rateAgeHours(rate_at: string, now = new Date()) {
  return (now.getTime() - new Date(rate_at).getTime()) / 36e5
}
export type Staleness = 'fresh' | 'old' | 'stale'
/** fresh < 24 h, old < 72 h, stale after that. */
export function staleness(rate_at: string, now = new Date()): Staleness {
  const h = rateAgeHours(rate_at, now)
  return h < 24 ? 'fresh' : h < 72 ? 'old' : 'stale'
}

// ---------------------------------------------------------------------
// Typing a price per kg / carton / pallet, and switching currency
// ---------------------------------------------------------------------
export const PRICE_UNITS = ['ton', 'kg', 'carton', 'pallet'] as const
export type PriceUnit = (typeof PRICE_UNITS)[number]

/** How many of this unit make one ton (null when the packing is unknown). */
export function unitsPerTon(unit: PriceUnit, netKg: number | null, cartonsPerPallet: number | null): number | null {
  if (unit === 'ton') return 1
  if (unit === 'kg') return 1000
  if (!pos(netKg)) return null
  if (unit === 'carton') return 1000 / netKg
  return pos(cartonsPerPallet) ? 1000 / (netKg * cartonsPerPallet) : null
}
export const toPerTon = (amount: number, unit: PriceUnit, netKg: number | null, cpp: number | null) => {
  const n = unitsPerTon(unit, netKg, cpp)
  return n == null ? null : amount * n
}
export const fromPerTon = (perTon: number, unit: PriceUnit, netKg: number | null, cpp: number | null) => {
  const n = unitsPerTon(unit, netKg, cpp)
  return n == null ? null : perTon / n
}

/** Reads what people type: "1,250.5", " 1250 ", "١٢٥٠" (Arabic digits). Empty or bad → null. */
export function parseAmount(v: string): number | null {
  const s = v.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[٬,\s]/g, '').replace('٫', '.')
  if (s === '' || !/^-?\d*\.?\d+$/.test(s)) return null
  return Number(s)
}

/** Rounds for showing in an input: big amounts to 2 decimals, small ones (per kg) to 4. */
export const roundForInput = (v: number) => String(Math.round(v * (Math.abs(v) < 10 ? 1e4 : 100)) / (Math.abs(v) < 10 ? 1e4 : 100))
