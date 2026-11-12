import { T, TV, tr, useT } from '@/lib/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, History, Info, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { PRICE_MANAGERS } from '@/lib/roles'
import { activePackaging, packOptionLabel, packsFor, type Category, type Product } from '@/lib/catalog'
import {
  COMPONENTS, computePrice, CURRENCIES, fromPerTon, INCOTERM_COMPONENTS, INCOTERMS, parseAmount, resolveRate, roundForInput, staleness, toPerTon, unitsPerTon,
  type Component, type Incoterm, type PriceUnit, type Rate,
} from '@/lib/pricing'
import { fetchVersions, isExpired, money, type PriceListRow, type PriceVersion } from '@/lib/prices'
import { usePersistentState } from '@/lib/usePersistentState'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ErrorState } from '@/components/ui/states'
import { StaleBadge } from './StaleBadge'
import { cn } from '@/lib/utils'

const COST_COLUMN: Record<Component, keyof PriceVersion> = {
  product: 'cost_per_kg', packaging: 'packaging_cost_per_carton', handling: 'handling_cost_per_carton',
  inland: 'inland_transport_per_ton', documentation: 'documentation_per_ton', other: 'other_costs_per_ton',
  freight: 'freight_per_ton', insurance: 'insurance_per_ton', destination: 'destination_costs_per_ton', duties: 'duties_per_ton',
}
const ALL_COMPONENTS = Object.keys(COMPONENTS) as Component[]
const SELL_COMPONENTS = ALL_COMPONENTS.filter((c) => COMPONENTS[c].ccy === 'sell')
const emptyCosts = () => Object.fromEntries(ALL_COMPONENTS.map((c) => [c, ''])) as Record<Component, string>
const str = (v: unknown) => (v == null ? '' : String(v))
const num = parseAmount
const today = () => new Date().toISOString().slice(0, 10)
const UNIT_LABEL: Record<PriceUnit, string> = { ton: 'per ton', kg: 'per kg', carton: 'per carton', pallet: 'per pallet' }

type State = {
  productId: string; packagingId: string; variety: string; incoterm: Incoterm; destination: string
  netKg: string; cpp: string; costCurrency: string; sellCurrency: string
  fxManual: string; useManualFx: boolean; costs: Record<Component, string>
  mode: 'margin' | 'price'; margin: string; price: string; priceUnit: PriceUnit
  validFrom: string; validUntil: string; notes: string
}
/** Where the numbers on screen came from, so the person knows what they are changing. */
type Origin = { kind: 'version' | 'imported' | 'list'; at: string; price: number; ccy: string }

/** Multiplies the selling-currency amounts (typed price and costs after the port) by a rate. */
function convertSellAmounts(x: State, rate: number): Pick<State, 'price' | 'costs'> {
  const costs = { ...x.costs }
  for (const c of SELL_COMPONENTS) { const v = num(costs[c]); if (v != null) costs[c] = roundForInput(v * rate) }
  const p = num(x.price)
  return { costs, price: p != null ? roundForInput(p * rate) : x.price }
}

export function PriceCalculator({ products, categories, rates, list = [], initial, onSaved }: {
  products: Product[]; categories: Category[]; rates: Rate[]; list?: PriceListRow[]
  initial: { productId: string; packagingId: string | null; incoterm: string | null } | null
  onSaved: () => void
}) {
  const { hasRole, session } = useAuth()
  const { t } = useT()
  const canSave = hasRole(...PRICE_MANAGERS)
  // the currency the person likes to see prices in is remembered
  const [preferred, setPreferred] = usePersistentState('calc_currency', 'USD')
  const [s, setS] = useState<State>({
    productId: '', packagingId: '', variety: '', incoterm: 'FOB', destination: '', netKg: '', cpp: '',
    costCurrency: 'EGP', sellCurrency: preferred, fxManual: '', useManualFx: false, costs: emptyCosts(),
    mode: 'price', margin: '', price: '', priceUnit: 'ton', validFrom: today(), validUntil: '', notes: '',
  })
  const [versions, setVersions] = useState<PriceVersion[]>([])
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const priceInput = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<State>) => setS((x) => ({ ...x, ...patch }))

  const product = products.find((p) => p.id === s.productId)
  const packs = product ? packsFor(product, s.variety) : []
  const grouped = useMemo(() => categories.map((c) => ({ c, items: products.filter((p) => p.category_id === c.id && !p.archived_at).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length), [products, categories])

  /** Shows a loaded price in the person's currency right away (if a rate exists). */
  function inPreferred(next: State, o: Origin): [State, Origin] {
    if (next.sellCurrency === preferred) return [next, o]
    const r = resolveRate(next.sellCurrency, preferred, rates)
    if (!r) return [next, o]
    return [{ ...next, ...convertSellAmounts(next, r.rate), sellCurrency: preferred }, o]
  }

  function applyVersion(v: PriceVersion, base: Partial<State> = {}) {
    const costs = emptyCosts()
    for (const c of ALL_COMPONENTS) costs[c] = str(v[COST_COLUMN[c]])
    const hasCosts = v.total_cost_per_ton != null && v.margin_pct != null
    setS((x) => {
      const next: State = {
        ...x, ...base,
        packagingId: v.packaging_id ?? base.packagingId ?? x.packagingId, variety: v.variety ?? '',
        incoterm: (v.incoterm ?? base.incoterm ?? x.incoterm) as Incoterm, destination: v.destination ?? '',
        netKg: str(v.net_weight_kg) || (base.netKg ?? x.netKg), cpp: str(v.cartons_per_pallet) || (base.cpp ?? x.cpp),
        costCurrency: v.cost_currency ?? x.costCurrency, sellCurrency: v.sell_currency, costs,
        mode: hasCosts ? 'margin' : 'price', margin: str(v.margin_pct != null ? Math.round(v.margin_pct * 100) / 100 : ''),
        price: roundForInput(v.price_per_ton), priceUnit: 'ton', useManualFx: false, fxManual: '',
        validFrom: today(), validUntil: '', notes: '',
      }
      const [n, o] = inPreferred(next, { kind: v.source === 'imported' ? 'imported' : 'version', at: v.created_at, price: v.price_per_ton, ccy: v.sell_currency })
      setOrigin(o)
      return n
    })
  }
  /** Sales roles cannot read the price history: start from the price list row instead. */
  function applyListRow(r: PriceListRow, base: Partial<State>) {
    setS((x) => {
      const next: State = {
        ...x, ...base, packagingId: r.packaging_id ?? base.packagingId ?? '', variety: r.variety ?? '',
        incoterm: (r.incoterm ?? base.incoterm ?? x.incoterm) as Incoterm, destination: r.destination ?? '',
        netKg: str(r.net_weight_kg) || (base.netKg ?? ''), cpp: str(r.cartons_per_pallet) || (base.cpp ?? ''),
        sellCurrency: r.sell_currency, costs: emptyCosts(), mode: 'price', margin: '', price: roundForInput(r.price_per_ton), priceUnit: 'ton',
      }
      const [n, o] = inPreferred(next, { kind: 'list', at: r.created_at, price: r.price_per_ton, ccy: r.sell_currency })
      setOrigin(o)
      return n
    })
  }

  /** Choose a product (and optionally packaging / incoterm): fill everything from Products and the last saved price. */
  async function selectProduct(productId: string, packagingId?: string | null, incoterm?: string | null) {
    setError(null); setOrigin(null)
    const p = products.find((x) => x.id === productId)
    if (!p) { set({ productId: '' }); setVersions([]); return }
    const pk = activePackaging(p).find((x) => x.id === packagingId) ?? activePackaging(p)[0]
    const base: Partial<State> = {
      productId, packagingId: pk?.id ?? '', netKg: str(pk?.net_weight_kg), cpp: str(pk?.cartons_per_pallet),
      ...(incoterm ? { incoterm: incoterm as Incoterm } : {}),
    }
    set({ ...base, costs: emptyCosts(), margin: '', price: '', variety: '', destination: '', mode: 'price', priceUnit: 'ton', sellCurrency: preferred })
    let vs: PriceVersion[] = []
    try { vs = await fetchVersions(productId) } catch { /* no access to the history: use the price list */ }
    setVersions(vs)
    const match = vs.find((v) => (v.packaging_id ?? '') === (pk?.id ?? '') && (!incoterm || v.incoterm === incoterm) && v.source === 'app')
      ?? vs.find((v) => v.source === 'app') ?? vs[0]
    if (match) return applyVersion(match, base)
    const row = list.find((r) => r.product_id === productId && (r.packaging_id ?? '') === (pk?.id ?? '')) ?? list.find((r) => r.product_id === productId)
    if (row) applyListRow(row, base)
    else setTimeout(() => priceInput.current?.focus(), 50)
  }

  useEffect(() => { if (initial?.productId) selectProduct(initial.productId, initial.packagingId, initial.incoterm) }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  function selectPackaging(id: string) {
    const pk = packs.find((x) => x.id === id)
    set({ packagingId: id, netKg: str(pk?.net_weight_kg), cpp: str(pk?.cartons_per_pallet) })
  }
  /** A variety narrows the packing list; keep the chosen packing if it still fits, else take the first that does. */
  function selectVariety(variety: string) {
    if (!product) return set({ variety })
    const l = packsFor(product, variety)
    const pk = l.find((x) => x.id === s.packagingId) ?? l[0]
    set({ variety, packagingId: pk?.id ?? '', netKg: str(pk?.net_weight_kg), cpp: str(pk?.cartons_per_pallet) })
  }

  /** Switch the selling currency: the typed price and the costs after the port are converted at today's saved rate. */
  function changeCurrency(to: string) {
    if (to === s.sellCurrency) return
    const r = resolveRate(s.sellCurrency, to, rates)
    setPreferred(to)
    if (!r) {
      const hasSellAmounts = num(s.price) != null || SELL_COMPONENTS.some((c) => num(s.costs[c]) != null)
      set({ sellCurrency: to })
      if (hasSellAmounts) toast.warning(tr('No exchange rate between {a} and {b} yet, so the numbers were not converted. Add it in “Exchange rates”.', { a: s.sellCurrency, b: to }))
      return
    }
    setS((x) => ({ ...x, ...convertSellAmounts(x, r.rate), sellCurrency: to }))
    toast.message(tr('Converted at 1 {a} = {r} {b}', { a: s.sellCurrency, b: to, r: r.rate.toLocaleString('en-US', { maximumFractionDigits: 4 }) }))
  }
  /** Change the unit of the typed price, keeping the same price. */
  function changeUnit(u: PriceUnit) {
    const p = num(s.price)
    const perTonNow = p == null ? null : toPerTon(p, s.priceUnit, num(s.netKg), num(s.cpp))
    const v = perTonNow == null ? null : fromPerTon(perTonNow, u, num(s.netKg), num(s.cpp))
    set({ priceUnit: u, price: v == null ? s.price : roundForInput(v) })
  }

  const netKg = num(s.netKg), cpp = num(s.cpp)
  const autoFx = resolveRate(s.costCurrency, s.sellCurrency, rates)
  const fx = s.useManualFx ? num(s.fxManual) : autoFx?.rate ?? null
  const typedPerTon = s.mode === 'price' && num(s.price) != null ? toPerTon(num(s.price)!, s.priceUnit, netKg, cpp) : null
  const result = computePrice({
    incoterm: s.incoterm, netWeightKg: netKg, cartonsPerPallet: cpp, fxRate: fx,
    costs: Object.fromEntries(ALL_COMPONENTS.map((c) => [c, num(s.costs[c])])),
    marginPct: s.mode === 'margin' ? num(s.margin) : null,
    pricePerTon: typedPerTon,
  })
  const included = new Set(INCOTERM_COMPONENTS[s.incoterm])
  const fxStale = !s.useManualFx && autoFx && s.costCurrency !== s.sellCurrency && staleness(autoFx.rate_at) === 'stale'
  const usesCostCcy = ALL_COMPONENTS.some((c) => COMPONENTS[c].ccy === 'cost' && included.has(c) && num(s.costs[c]))
  const hasCosts = result.totalCostPerTon != null
  // the loaded price, in the currency shown now (null when there is no rate)
  const originRate = !origin ? null : origin.ccy === s.sellCurrency ? 1 : resolveRate(origin.ccy, s.sellCurrency, rates)?.rate ?? null
  const changed = origin && result.pricePerTon != null && (originRate == null || Math.abs(result.pricePerTon - origin.price * originRate) > 0.01)

  async function save() {
    if (!product || !result.pricePerTon) return
    if (s.validUntil && s.validUntil < s.validFrom) return toast.error('“Valid until” is before “Valid from”.')
    if (fxStale && !window.confirm(tr('The exchange rate is more than 3 days old. Save anyway?'))) return
    setSaving(true)
    const row: Record<string, unknown> = {
      product_id: product.id, packaging_id: s.packagingId || null, variety: s.variety || null,
      incoterm: s.incoterm, destination: s.destination.trim() || null,
      net_weight_kg: netKg, cartons_per_pallet: cpp ? Math.round(cpp) : null,
      cost_currency: usesCostCcy ? s.costCurrency : null, sell_currency: s.sellCurrency,
      fx_rate: usesCostCcy ? fx : null,
      fx_source: usesCostCcy ? (s.useManualFx ? 'Manual (calculator)' : autoFx?.source ?? null) : null,
      fx_rate_at: usesCostCcy ? (s.useManualFx ? new Date().toISOString() : autoFx?.rate_at ?? null) : null,
      total_cost_per_ton: result.totalCostPerTon != null ? round(result.totalCostPerTon, 4) : null,
      margin_pct: result.marginPct != null ? round(result.marginPct, 4) : null,
      price_per_ton: round(result.pricePerTon, 2),
      valid_from: s.validFrom, valid_until: s.validUntil || null, notes: s.notes.trim() || null,
      created_by: session?.user.id,
    }
    for (const c of ALL_COMPONENTS) row[COST_COLUMN[c]] = num(s.costs[c])
    const { error } = await supabase.from('product_prices').insert(row)
    setSaving(false)
    if (error) return toast.error(error.message.includes('row-level') ? 'Your role cannot save prices.' : error.message)
    toast.success('New price saved — the price list is updated')
    onSaved()
    selectProduct(product.id, s.packagingId, s.incoterm)
  }

  // the same price in the other currencies (per the unit the person is looking at)
  const shownUnit: PriceUnit = s.mode === 'price' ? s.priceUnit : 'ton'
  const others = result.pricePerTon == null ? [] : CURRENCIES.filter((c) => c !== s.sellCurrency).map((c) => {
    const r = resolveRate(s.sellCurrency, c, rates)
    const v = r ? fromPerTon(result.pricePerTon! * r.rate, shownUnit, netKg, cpp) : null
    return { c, v }
  })

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader><CardTitle>What are you pricing?</CardTitle><CardDescription>Choose a product: its packing and last price fill in by themselves.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Product" className="sm:col-span-2">
              <Select value={s.productId} onChange={(e) => selectProduct(e.target.value)}>
                <option value="">Choose a product…</option>
                {grouped.map(({ c, items }) => <optgroup key={c.id} label={c.name}>{items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}
              </Select>
            </Field>
            {product && (
              <>
                <Field label="Variety">
                  <Select value={s.variety} onChange={(e) => selectVariety(e.target.value)} disabled={!product.varieties.length}>
                    <option value="">{product.varieties.length ? 'Any / not specified' : 'No varieties'}</option>
                    {product.varieties.map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Packaging">
                  <Select value={s.packagingId} onChange={(e) => selectPackaging(e.target.value)}>
                    {!packs.length && <option value="">No packaging saved</option>}
                    {packs.map((pk) => <option key={pk.id} value={pk.id}>{packOptionLabel(pk)}</option>)}
                  </Select>
                </Field>
                <Field label="Incoterm"><Select value={s.incoterm} onChange={(e) => set({ incoterm: e.target.value as Incoterm })}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</Select></Field>
                <Field label="Destination (port / country)"><Input value={s.destination} onChange={(e) => set({ destination: e.target.value })} /></Field>
                <Field label="Net kg per carton"><Input inputMode="decimal" value={s.netKg} onChange={(e) => set({ netKg: e.target.value })} /></Field>
                <Field label="Cartons per pallet"><Input inputMode="numeric" value={s.cpp} onChange={(e) => set({ cpp: e.target.value })} /></Field>
              </>
            )}
            {error && <div className="sm:col-span-2"><ErrorState message={error} /></div>}
          </CardContent>
        </Card>

        {product && (
          <Card>
            <CardHeader>
              <CardTitle>Costs</CardTitle>
              <CardDescription>{s.mode === 'price'
                ? t('Optional: fill them to see your profit on the price you typed. Greyed rows are paid by the buyer under {i}.', { i: s.incoterm })
                : t('The price is built from these costs + your margin. Greyed rows are paid by the buyer under {i}.', { i: s.incoterm })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Costs are in"><Select value={s.costCurrency} onChange={(e) => set({ costCurrency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                {s.costCurrency !== s.sellCurrency && (
                  <div className="space-y-1.5 self-end text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">1 {s.costCurrency} = {fx ? fx.toLocaleString('en-US', { maximumFractionDigits: 6 }) : '?'} {s.sellCurrency}</span>
                      {!s.useManualFx && autoFx && <StaleBadge at={autoFx.rate_at} />}
                    </div>
                    {!autoFx && !s.useManualFx && <p className="text-xs text-destructive"><T>No saved rate for this pair. Add one in “Exchange rates” or enter it below.</T></p>}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" className="size-3.5 accent-[#23856B]" checked={s.useManualFx} onChange={(e) => set({ useManualFx: e.target.checked })} /><T>Use a different rate for this price</T>
                    </label>
                    {s.useManualFx && <Input inputMode="decimal" placeholder={`1 ${s.costCurrency} = ? ${s.sellCurrency}`} value={s.fxManual} onChange={(e) => set({ fxManual: e.target.value })} />}
                  </div>
                )}
              </div>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {ALL_COMPONENTS.map((c) => {
                  const m = COMPONENTS[c], on = included.has(c)
                  return (
                    <Field key={c} label={`${t(m.label)} (${m.ccy === 'cost' ? s.costCurrency : s.sellCurrency} ${t(m.unit)})`} className={cn(!on && 'opacity-45')}
                      hint={!on ? t('Buyer pays under {i}', { i: s.incoterm }) : undefined}>
                      <Input inputMode="decimal" value={s.costs[c]} disabled={!on} onChange={(e) => set({ costs: { ...s.costs, [c]: e.target.value } })} />
                    </Field>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4 lg:col-span-2">
        <Card className="lg:sticky lg:top-20">
          <CardHeader className="pb-3">
            <CardTitle>Selling price</CardTitle>
            <CardDescription>{s.incoterm}{s.destination ? ` ${s.destination}` : ''}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 1. the currency: one tap, everything converts */}
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground"><T>Show the price in</T></div>
              <div role="radiogroup" aria-label={t('Currency')} className="grid grid-cols-6 gap-1 rounded-lg bg-muted p-1">
                {CURRENCIES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={s.sellCurrency === c} onClick={() => changeCurrency(c)}
                    className={cn('rounded-md py-1.5 text-xs font-semibold transition-colors', s.sellCurrency === c ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{c}</button>
                ))}
              </div>
            </div>

            {/* 2. how the price is set */}
            <div className="flex rounded-lg border border-border p-0.5 text-sm">
              {(['price', 'margin'] as const).map((m) => (
                <button key={m} type="button"
                  onClick={() => {
                    if (m === s.mode) return
                    if (m === 'price' && result.pricePerTon) set({ mode: m, priceUnit: 'ton', price: roundForInput(result.pricePerTon) })
                    else if (m === 'margin' && !s.margin && result.marginPct != null) set({ mode: m, margin: String(Math.round(result.marginPct * 100) / 100) })
                    else set({ mode: m })
                  }}
                  className={cn('flex-1 rounded-md px-2 py-1.5', s.mode === m ? 'bg-accent font-medium' : 'text-muted-foreground')}>
                  <T>{m === 'price' ? 'Type the price' : 'From costs + margin'}</T>
                </button>
              ))}
            </div>

            {s.mode === 'price' ? (
              <Field label={t('Price ({c})', { c: s.sellCurrency })}>
                <div className="flex gap-1.5">
                  <Input ref={priceInput} inputMode="decimal" value={s.price} onChange={(e) => set({ price: e.target.value })} onFocus={(e) => e.target.select()}
                    className="h-11 text-lg font-semibold tabular-nums" placeholder="0" aria-label={t('Price')} />
                  <Select value={s.priceUnit} onChange={(e) => changeUnit(e.target.value as PriceUnit)} className="h-11 w-[130px] shrink-0" aria-label={t('Per')}>
                    {(['ton', 'kg', 'carton', 'pallet'] as const).map((u) => <option key={u} value={u} disabled={unitsPerTon(u, netKg, cpp) == null}>{UNIT_LABEL[u]}</option>)}
                  </Select>
                </div>
              </Field>
            ) : (
              <Field label="Target margin %" hint="Margin = profit ÷ selling price"><Input inputMode="decimal" value={s.margin} onChange={(e) => set({ margin: e.target.value })} className="h-11 text-lg font-semibold" /></Field>
            )}

            {origin && (
              <p className="flex items-start gap-2 rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {origin.kind === 'imported' ? <T>Loaded the price imported from the old CRM.</T> : origin.kind === 'list' ? <T>Loaded the current price from the price list.</T>
                    : <TV k="Loaded the price saved {date}." v={{ date: new Date(origin.at).toLocaleDateString('en-GB') }} />}
                  {' '}<span className="font-medium tabular-nums" dir="ltr">{money(origin.price, origin.ccy)} / ton</span>
                  {origin.ccy !== s.sellCurrency && originRate != null && <> · <TV k="shown in {c} at {r}" v={{ c: s.sellCurrency, r: originRate.toLocaleString('en-US', { maximumFractionDigits: 4 }) }} /></>}.
                  {canSave && <>{' '}<T>Change it and save as the new price.</T></>}
                </span>
              </p>
            )}

            {result.problems.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                {result.problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{t(p)}</li>)}
              </ul>
            )}

            {/* 3. the answer */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="text-xs text-muted-foreground"><T>Price per ton</T></div>
              <div className="text-3xl font-bold tabular-nums tracking-tight text-primary" dir="ltr">{money(result.pricePerTon)} <span className="text-base font-semibold">{s.sellCurrency}</span></div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                {([['Per kg', result.per.price.kg, 3], ['Per carton', result.per.price.carton, 2], ['Per pallet', result.per.price.pallet, 2]] as const).map(([l, v, d]) => (
                  <div key={l} className="rounded-lg bg-card px-2 py-1.5">
                    <dt className="text-[11px] text-muted-foreground"><T>{l}</T></dt>
                    <dd className="font-semibold tabular-nums" dir="ltr">{money(v, undefined, d)}</dd>
                  </div>
                ))}
              </dl>
              {others.length > 0 && (
                <div className="mt-3 border-t border-primary/15 pt-2">
                  <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground"><ArrowLeftRight className="size-3" /><TV k="Same price {u} in" v={{ u: t(UNIT_LABEL[shownUnit]) }} /></div>
                  <div className="flex flex-wrap gap-1.5">
                    {others.map(({ c, v }) => (
                      <button key={c} type="button" onClick={() => changeCurrency(c)} disabled={v == null} data-tip={v == null ? t('No exchange rate yet') : t('Show in {c}', { c })}
                        className="rounded-md border border-border bg-card px-2 py-1 text-xs tabular-nums hover:border-primary disabled:opacity-50" dir="ltr">
                        {v == null ? '—' : money(v, undefined, v < 10 ? 3 : 2)} <span className="font-semibold">{c}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {hasCosts && (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Profit / ton" value={money(result.grossProfitPerTon)} warn={(result.grossProfitPerTon ?? 0) < 0} />
                  <Stat label="Margin" value={result.marginPct == null ? '—' : `${result.marginPct.toFixed(1)}%`} warn={result.marginPct != null && result.marginPct < 0} />
                  <Stat label="Markup" value={result.markupPct == null ? '—' : `${result.markupPct.toFixed(1)}%`} />
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground"><TV k="Cost: {v} per ton — see the breakdown" v={{ v: money(result.totalCostPerTon, s.sellCurrency) }} /></summary>
                  <ul className="mt-2 space-y-1">
                    {result.breakdown.map((b) => <li key={b.component} className="flex justify-between"><span>{t(COMPONENTS[b.component].label)}</span><span className="tabular-nums">{money(b.perTon)}</span></li>)}
                  </ul>
                </details>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              {result.cartonsPerTon ? `${result.cartonsPerTon.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${t('cartons per ton')}` : ''}
              {result.kgPerPallet ? ` · ${result.kgPerPallet.toLocaleString('en-US')} ${t('kg net per pallet')}` : ''}
            </p>

            {canSave && product && (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valid from"><Input type="date" value={s.validFrom} onChange={(e) => set({ validFrom: e.target.value })} /></Field>
                  <Field label="Valid until"><Input type="date" value={s.validUntil} onChange={(e) => set({ validUntil: e.target.value })} /></Field>
                </div>
                <Field label="Note"><Textarea className="min-h-[52px]" value={s.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
                <Button className="w-full" onClick={save} disabled={saving || !result.pricePerTon || result.problems.length > 0}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}{changed || !origin ? 'Save as the new price' : 'Save again (same price)'}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground"><T>The old price stays in the history below.</T></p>
              </div>
            )}
          </CardContent>
        </Card>

        {product && versions.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" />Price history</CardTitle><CardDescription>Tap a version to load it. Old versions are kept and never changed.</CardDescription></CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {versions.map((v) => (
                  <li key={v.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-2 py-2 text-start hover:text-primary" onClick={() => applyVersion(v)}>
                      <span>
                        <span className="font-medium">{v.incoterm ?? t('No Incoterm')}</span>
                        <span className="text-muted-foreground"> · {new Date(v.created_at).toLocaleDateString('en-GB')}{v.variety ? ` · ${v.variety}` : ''}</span>
                        {v.source === 'imported' && <Badge className="ms-1">imported</Badge>}
                        {isExpired(v) && <Badge className="ms-1 border-red-200 bg-red-50 text-red-800">expired</Badge>}
                      </span>
                      <span className="tabular-nums" dir="ltr">{money(v.price_per_ton, v.sell_currency)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-muted px-2 py-2">
      <div className="text-[11px] text-muted-foreground"><T>{label}</T></div>
      <div className={cn('text-sm font-semibold tabular-nums', warn && 'text-destructive')} dir="ltr">{value}</div>
    </div>
  )
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d
