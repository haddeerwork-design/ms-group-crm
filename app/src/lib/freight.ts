// Freight maths. Pure functions, covered by freight.test.ts.

export type FreightRate = {
  mode: 'sea' | 'air' | 'inland'
  rate_per_container: number | null; rate_per_kg: number | null
  min_charge: number | null; additional_fees: number | null; currency: string
}
export type AirInput = {
  cartons: number; grossKgPerCarton: number
  lengthCm: number | null; widthCm: number | null; heightCm: number | null
  divisor: number        // volumetric divisor, e.g. 6000 (your airline/forwarder confirms it)
  netTons: number | null
}
export type SeaInput = { containers: number; netTons: number | null }

export type FreightResult = {
  ok: boolean; problems: string[]
  actualKg?: number; volumetricKg?: number | null; chargeableKg?: number
  base: number; minApplied: boolean; fees: number; total: number; perNetTon: number | null; currency: string
}

const pos = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v) && v > 0

/** Air: chargeable weight = max(actual gross, volumetric). Volumetric kg = L×W×H (cm) ÷ divisor, per carton. */
export function airFreight(rate: FreightRate, i: AirInput): FreightResult {
  const problems: string[] = []
  if (!pos(rate.rate_per_kg)) problems.push('This rate has no price per kg.')
  if (!pos(i.cartons)) problems.push('Enter the number of cartons.')
  if (!pos(i.grossKgPerCarton)) problems.push('Enter the gross weight per carton.')
  if (!pos(i.divisor)) problems.push('Enter the volumetric divisor.')
  const actualKg = pos(i.cartons) && pos(i.grossKgPerCarton) ? i.cartons * i.grossKgPerCarton : 0
  const hasDims = pos(i.lengthCm) && pos(i.widthCm) && pos(i.heightCm)
  if (!hasDims) problems.push('Carton dimensions are missing, so volumetric weight cannot be checked.')
  const volumetricKg = hasDims && pos(i.cartons) && pos(i.divisor) ? (i.lengthCm! * i.widthCm! * i.heightCm! / i.divisor) * i.cartons : null
  const chargeableKg = Math.max(actualKg, volumetricKg ?? 0)
  const raw = chargeableKg * (rate.rate_per_kg ?? 0)
  const minApplied = pos(rate.min_charge) && raw < rate.min_charge
  const base = minApplied ? rate.min_charge! : raw
  const fees = rate.additional_fees ?? 0
  const total = base + fees
  return {
    ok: problems.length === 0, problems, actualKg, volumetricKg, chargeableKg, base, minApplied, fees, total,
    perNetTon: pos(i.netTons) && total ? total / i.netTons : null, currency: rate.currency,
  }
}

/** Sea / inland: rate per container × containers (+ fees). */
export function seaFreight(rate: FreightRate, i: SeaInput): FreightResult {
  const problems: string[] = []
  if (!pos(rate.rate_per_container)) problems.push('This rate has no price per container.')
  if (!pos(i.containers) || !Number.isInteger(i.containers)) problems.push('Enter a whole number of containers.')
  const raw = (rate.rate_per_container ?? 0) * (pos(i.containers) ? i.containers : 0)
  const minApplied = pos(rate.min_charge) && raw < rate.min_charge
  const base = minApplied ? rate.min_charge! : raw
  const fees = (rate.additional_fees ?? 0) * (pos(i.containers) ? i.containers : 0)
  const total = base + fees
  return { ok: problems.length === 0, problems, base, minApplied, fees, total, perNetTon: pos(i.netTons) && total ? total / i.netTons : null, currency: rate.currency }
}

export function rateValidity(r: { valid_from: string | null; valid_until: string | null }, today = new Date().toISOString().slice(0, 10)) {
  if (r.valid_until && r.valid_until < today) return 'expired' as const
  if (r.valid_from && r.valid_from > today) return 'future' as const
  if (!r.valid_until) return 'no_date' as const
  return 'valid' as const
}
