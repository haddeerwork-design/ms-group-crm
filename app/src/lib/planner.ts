// Container loading maths. Pure functions, covered by planner.test.ts.
import type { ProductType } from './catalog'

export type QtyUnit = 'pallets' | 'cartons' | 'tons'
export type ContainerLimits = { maxPallets: number; maxPayloadKg: number; emptyPalletKg: number; isReefer: boolean; count: number }
export type PlanLine = {
  name: string; productType: ProductType
  netKg: number | null; grossKg: number | null; cpp: number | null
  qtyUnit: QtyUnit; quantity: number | null; pricePerTon: number | null
}
export type LineResult = {
  ok: boolean; problems: string[]
  cartons: number | null; pallets: number | null; palletSpots: number | null
  netKg: number | null; grossKg: number | null; value: number | null; usedNetAsGross: boolean
}
export type PlanResult = {
  lines: LineResult[]
  cartons: number; pallets: number; palletSpots: number; netKg: number; grossKg: number; value: number | null
  capacity: { pallets: number; payloadKg: number }
  usage: { pallets: number; weight: number }   // 0..1+ (over 1 = over capacity)
  warnings: { level: 'error' | 'warn'; text: string }[]
}

const pos = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v) && v > 0

export function computeLine(l: PlanLine, emptyPalletKg: number): LineResult {
  const problems: string[] = []
  const net = pos(l.netKg) ? l.netKg : null
  const cpp = pos(l.cpp) ? l.cpp : null
  const q = pos(l.quantity) ? l.quantity : null
  let cartons: number | null = null
  if (!q) problems.push('Enter a quantity.')
  else if (l.qtyUnit === 'cartons') cartons = q
  else if (l.qtyUnit === 'pallets') { if (cpp) cartons = q * cpp; else problems.push('Cartons per pallet is missing.') }
  else { if (net) cartons = Math.ceil((q * 1000) / net - 1e-9); else problems.push('Net kg per carton is missing.') }

  if (!cpp && l.qtyUnit !== 'pallets') problems.push('Cartons per pallet is missing, so pallets cannot be counted.')
  if (!net && l.qtyUnit !== 'tons') problems.push('Net kg per carton is missing, so weight cannot be counted.')

  const pallets = cartons != null && cpp ? cartons / cpp : l.qtyUnit === 'pallets' && q ? q : null
  const palletSpots = pallets != null ? Math.ceil(pallets - 1e-9) : null
  const usedNetAsGross = !pos(l.grossKg) && !!net
  const gross = pos(l.grossKg) ? l.grossKg : net
  const netKg = cartons != null && net ? cartons * net : null
  const grossKg = cartons != null && gross ? cartons * gross + (palletSpots ?? 0) * emptyPalletKg : null
  const value = netKg != null && l.pricePerTon != null && l.pricePerTon >= 0 ? (netKg / 1000) * l.pricePerTon : null
  return { ok: problems.length === 0, problems: [...new Set(problems)], cartons, pallets, palletSpots, netKg, grossKg, value, usedNetAsGross }
}

export function computePlan(lines: PlanLine[], c: ContainerLimits | null): PlanResult {
  const empty = c?.emptyPalletKg ?? 0
  const res = lines.map((l) => computeLine(l, empty))
  const sum = (k: 'cartons' | 'pallets' | 'palletSpots' | 'netKg' | 'grossKg') => res.reduce((s, r) => s + (r[k] ?? 0), 0)
  const values = res.map((r) => r.value)
  const value = lines.length && values.every((v) => v != null) ? values.reduce((s, v) => s + (v ?? 0), 0) : null
  const capacity = { pallets: c ? c.maxPallets * c.count : 0, payloadKg: c ? c.maxPayloadKg * c.count : 0 }
  const palletSpots = sum('palletSpots'), grossKg = sum('grossKg')
  const usage = { pallets: capacity.pallets ? palletSpots / capacity.pallets : 0, weight: capacity.payloadKg ? grossKg / capacity.payloadKg : 0 }

  const warnings: PlanResult['warnings'] = []
  if (!c) warnings.push({ level: 'error', text: 'Choose a container type.' })
  if (c && palletSpots > capacity.pallets) warnings.push({ level: 'error', text: `Over capacity: ${palletSpots} pallet places needed, ${capacity.pallets} available.` })
  if (c && grossKg > capacity.payloadKg) warnings.push({ level: 'error', text: `Over weight: ${fmtKg(grossKg)} gross, payload limit ${fmtKg(capacity.payloadKg)}.` })
  const types = new Set(lines.map((l) => l.productType))
  if (types.has('fresh') && types.has('frozen')) warnings.push({ level: 'warn', text: 'Fresh and frozen products in the same plan need different temperatures.' })
  if (c && !c.isReefer && (types.has('fresh') || types.has('frozen'))) warnings.push({ level: 'warn', text: 'Fresh or frozen products in a dry (non-reefer) container.' })
  res.forEach((r, i) => {
    if (r.usedNetAsGross) warnings.push({ level: 'warn', text: `${lines[i].name}: gross weight missing, net weight used.` })
    r.problems.forEach((p) => warnings.push({ level: 'error', text: `${lines[i].name}: ${p}` }))
  })
  if (lines.length && value == null && lines.some((l) => l.pricePerTon != null)) warnings.push({ level: 'warn', text: 'Some products have no price, so the total value is not shown.' })

  return { lines: res, cartons: sum('cartons'), pallets: sum('pallets'), palletSpots, netKg: sum('netKg'), grossKg, value, capacity, usage, warnings }
}

/** Largest number of cartons line `i` can have so the whole plan still fits
 *  (pallet places AND payload). Partial pallets take a full pallet place. */
export function maxCartonsFor(i: number, lines: PlanLine[], c: ContainerLimits): number | null {
  const l = lines[i]
  const cpp = pos(l.cpp) ? l.cpp : null
  const g = pos(l.grossKg) ? l.grossKg : pos(l.netKg) ? l.netKg : null
  if (!cpp || !g) return null
  const others = computePlan(lines.filter((_, j) => j !== i), c)
  const P = c.maxPallets * c.count - others.palletSpots
  const W = c.maxPayloadKg * c.count - others.grossKg
  for (let k = Math.max(0, P); k >= 1; k--) {
    const byWeight = Math.floor((W - k * c.emptyPalletKg) / g + 1e-9)
    const cap = Math.min(k * cpp, byWeight)
    if (cap > (k - 1) * cpp) return cap
  }
  return 0
}

/** Converts a carton count into the line's own unit. */
export function cartonsToUnit(cartons: number, l: Pick<PlanLine, 'qtyUnit' | 'cpp' | 'netKg'>): number | null {
  if (l.qtyUnit === 'cartons') return cartons
  if (l.qtyUnit === 'pallets') return pos(l.cpp) ? cartons / l.cpp : null
  return pos(l.netKg) ? (cartons * l.netKg) / 1000 : null
}

export const fmtKg = (kg: number) => `${Math.round(kg).toLocaleString()} kg`
