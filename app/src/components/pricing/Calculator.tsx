import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, History, Info, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { PRICE_MANAGERS } from '@/lib/roles'
import { activePackaging, type Category, type Product } from '@/lib/catalog'
import {
  COMPONENTS, computePrice, CURRENCIES, INCOTERM_COMPONENTS, INCOTERMS, resolveRate, staleness,
  type Component, type Incoterm, type Rate,
} from '@/lib/pricing'
import { fetchVersions, isExpired, money, type PriceVersion } from '@/lib/prices'
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
const emptyCosts = () => Object.fromEntries(ALL_COMPONENTS.map((c) => [c, ''])) as Record<Component, string>
const str = (v: unknown) => (v == null ? '' : String(v))
const num = (v: string) => (v.trim() === '' || !isFinite(Number(v)) ? null : Number(v))
const today = () => new Date().toISOString().slice(0, 10)

type State = {
  productId: string; packagingId: string; variety: string; incoterm: Incoterm; destination: string
  netKg: string; cpp: string; costCurrency: string; sellCurrency: string
  fxManual: string; useManualFx: boolean; costs: Record<Component, string>
  mode: 'margin' | 'price'; margin: string; price: string
  validFrom: string; validUntil: string; notes: string
}

export function PriceCalculator({ products, categories, rates, initial, onSaved }: {
  products: Product[]; categories: Category[]; rates: Rate[]
  initial: { productId: string; packagingId: string | null; incoterm: string | null } | null
  onSaved: () => void
}) {
  const { hasRole, session } = useAuth()
  const canSave = hasRole(...PRICE_MANAGERS)
  const [s, setS] = useState<State>({
    productId: '', packagingId: '', variety: '', incoterm: 'CIF', destination: '', netKg: '', cpp: '',
    costCurrency: 'EGP', sellCurrency: 'USD', fxManual: '', useManualFx: false, costs: emptyCosts(),
    mode: 'margin', margin: '', price: '', validFrom: today(), validUntil: '', notes: '',
  })
  const [versions, setVersions] = useState<PriceVersion[]>([])
  const [loadedFrom, setLoadedFrom] = useState<PriceVersion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<State>) => setS((x) => ({ ...x, ...patch }))

  const product = products.find((p) => p.id === s.productId)
  const packs = product ? activePackaging(product) : []
  const grouped = useMemo(() => categories.map((c) => ({ c, items: products.filter((p) => p.category_id === c.id && !p.archived_at).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length), [products, categories])

  function applyVersion(v: PriceVersion, base: Partial<State> = {}) {
    const costs = emptyCosts()
    for (const c of ALL_COMPONENTS) costs[c] = str(v[COST_COLUMN[c]])
    setS((x) => ({
      ...x, ...base,
      packagingId: v.packaging_id ?? base.packagingId ?? x.packagingId, variety: v.variety ?? '',
      incoterm: (v.incoterm ?? base.incoterm ?? x.incoterm) as Incoterm, destination: v.destination ?? '',
      netKg: str(v.net_weight_kg) || (base.netKg ?? x.netKg), cpp: str(v.cartons_per_pallet) || (base.cpp ?? x.cpp),
      costCurrency: v.cost_currency ?? x.costCurrency, sellCurrency: v.sell_currency, costs,
      mode: v.margin_pct != null ? 'margin' : 'price', margin: str(v.margin_pct != null ? Math.round(v.margin_pct * 100) / 100 : ''),
      price: str(v.price_per_ton), useManualFx: false, fxManual: '',
      validFrom: today(), validUntil: '', notes: '',
    }))
    setLoadedFrom(v)
  }

  /** Choose a product (and optionally packaging / incoterm): fill everything from Products and the last saved price. */
  async function selectProduct(productId: string, packagingId?: string | null, incoterm?: string | null) {
    setError(null); setLoadedFrom(null)
    const p = products.find((x) => x.id === productId)
    if (!p) { set({ productId: '' }); setVersions([]); return }
    const pk = activePackaging(p).find((x) => x.id === packagingId) ?? activePackaging(p)[0]
    const base: Partial<State> = {
      productId, packagingId: pk?.id ?? '', netKg: str(pk?.net_weight_kg), cpp: str(pk?.cartons_per_pallet),
      ...(incoterm ? { incoterm: incoterm as Incoterm } : {}),
    }
    set({ ...base, costs: emptyCosts(), margin: '', price: '', variety: '', destination: '' })
    try {
      const vs = await fetchVersions(productId)
      setVersions(vs)
      const match = vs.find((v) => (v.packaging_id ?? '') === (pk?.id ?? '') && (!incoterm || v.incoterm === incoterm) && v.source === 'app')
        ?? vs.find((v) => v.source === 'app') ?? vs[0]
      if (match) applyVersion(match, base)
    } catch (e) { setError((e as Error).message) }
  }

  useEffect(() => { if (initial?.productId) selectProduct(initial.productId, initial.packagingId, initial.incoterm) }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  function selectPackaging(id: string) {
    const pk = packs.find((x) => x.id === id)
    set({ packagingId: id, netKg: str(pk?.net_weight_kg), cpp: str(pk?.cartons_per_pallet) })
  }

  const autoFx = resolveRate(s.costCurrency, s.sellCurrency, rates)
  const fx = s.useManualFx ? num(s.fxManual) : autoFx?.rate ?? null
  const result = computePrice({
    incoterm: s.incoterm, netWeightKg: num(s.netKg), cartonsPerPallet: num(s.cpp), fxRate: fx,
    costs: Object.fromEntries(ALL_COMPONENTS.map((c) => [c, num(s.costs[c])])),
    marginPct: s.mode === 'margin' ? num(s.margin) : null,
    pricePerTon: s.mode === 'price' ? num(s.price) : null,
  })
  const included = new Set(INCOTERM_COMPONENTS[s.incoterm])
  const fxStale = !s.useManualFx && autoFx && s.costCurrency !== s.sellCurrency && staleness(autoFx.rate_at) === 'stale'
  const usesCostCcy = ALL_COMPONENTS.some((c) => COMPONENTS[c].ccy === 'cost' && included.has(c) && num(s.costs[c]))

  async function save() {
    if (!product || !result.pricePerTon) return
    if (s.validUntil && s.validUntil < s.validFrom) return toast.error('“Valid until” is before “Valid from”.')
    if (fxStale && !window.confirm('The exchange rate is more than 3 days old. Save anyway?')) return
    setSaving(true)
    const row: Record<string, unknown> = {
      product_id: product.id, packaging_id: s.packagingId || null, variety: s.variety || null,
      incoterm: s.incoterm, destination: s.destination.trim() || null,
      net_weight_kg: num(s.netKg), cartons_per_pallet: num(s.cpp) ? Math.round(num(s.cpp)!) : null,
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
    toast.success('New price version saved')
    onSaved()
    selectProduct(product.id, s.packagingId, s.incoterm)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader><CardTitle>Product</CardTitle><CardDescription>Packing comes from Products. You can change it here for this price only.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Product" className="sm:col-span-2">
              <Select value={s.productId} onChange={(e) => selectProduct(e.target.value)}>
                <option value="">Choose a product…</option>
                {grouped.map(({ c, items }) => <optgroup key={c.id} label={c.name}>{items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}
              </Select>
            </Field>
            {product && (
              <>
                <Field label="Packaging">
                  <Select value={s.packagingId} onChange={(e) => selectPackaging(e.target.value)}>
                    {!packs.length && <option value="">No packaging saved</option>}
                    {packs.map((pk) => <option key={pk.id} value={pk.id}>{pk.label}{pk.is_default ? ' ★' : ''}</option>)}
                  </Select>
                </Field>
                <Field label="Variety">
                  <Select value={s.variety} onChange={(e) => set({ variety: e.target.value })} disabled={!product.varieties.length}>
                    <option value="">{product.varieties.length ? 'Any / not specified' : 'No varieties'}</option>
                    {product.varieties.map((v) => <option key={v}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Net kg per carton"><Input inputMode="decimal" value={s.netKg} onChange={(e) => set({ netKg: e.target.value })} /></Field>
                <Field label="Cartons per pallet"><Input inputMode="numeric" value={s.cpp} onChange={(e) => set({ cpp: e.target.value })} /></Field>
              </>
            )}
            {loadedFrom && (
              <p className="flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground sm:col-span-2">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {loadedFrom.source === 'imported'
                  ? 'Loaded the price imported from the current CRM. Set the Incoterm and costs, then save a new version.'
                  : `Loaded the version saved ${new Date(loadedFrom.created_at).toLocaleDateString()}. Change anything and save as a new version.`}
              </p>
            )}
            {error && <div className="sm:col-span-2"><ErrorState message={error} /></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Terms & currencies</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Incoterm"><Select value={s.incoterm} onChange={(e) => set({ incoterm: e.target.value as Incoterm })}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</Select></Field>
            <Field label="Destination (port / country)"><Input value={s.destination} onChange={(e) => set({ destination: e.target.value })} /></Field>
            <Field label="Costs are in"><Select value={s.costCurrency} onChange={(e) => set({ costCurrency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Sell in"><Select value={s.sellCurrency} onChange={(e) => set({ sellCurrency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            {s.costCurrency !== s.sellCurrency && (
              <div className="space-y-2 rounded-md border border-border p-3 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">1 {s.costCurrency} = {fx ? fx.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '?'} {s.sellCurrency}</span>
                  {!s.useManualFx && autoFx && <span className="flex items-center gap-2 text-xs text-muted-foreground">{autoFx.source} · {autoFx.path} <StaleBadge at={autoFx.rate_at} /></span>}
                </div>
                {!autoFx && !s.useManualFx && <p className="text-xs text-destructive">No saved rate for this pair. Add one in “Exchange rates” or enter it below.</p>}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="size-3.5 accent-[#23856B]" checked={s.useManualFx} onChange={(e) => set({ useManualFx: e.target.checked })} />Use a different rate for this price
                </label>
                {s.useManualFx && <Input inputMode="decimal" placeholder={`1 ${s.costCurrency} = ? ${s.sellCurrency}`} value={s.fxManual} onChange={(e) => set({ fxManual: e.target.value })} />}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Costs</CardTitle><CardDescription>Greyed rows are paid by the buyer under {s.incoterm}, so they are not counted.</CardDescription></CardHeader>
          <CardContent className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {ALL_COMPONENTS.map((c) => {
              const m = COMPONENTS[c], on = included.has(c)
              return (
                <Field key={c} label={`${m.label} (${m.ccy === 'cost' ? s.costCurrency : s.sellCurrency} ${m.unit})`} className={cn(!on && 'opacity-45')}
                  hint={!on ? `Buyer pays under ${s.incoterm}` : undefined}>
                  <Input inputMode="decimal" value={s.costs[c]} disabled={!on} onChange={(e) => set({ costs: { ...s.costs, [c]: e.target.value } })} />
                </Field>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <Card className="lg:sticky lg:top-20">
          <CardHeader><CardTitle>Selling price</CardTitle><CardDescription>{s.incoterm}{s.destination ? ` ${s.destination}` : ''} · {s.sellCurrency}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex rounded-md border border-border p-0.5 text-sm">
              {(['margin', 'price'] as const).map((m) => (
                <button key={m} type="button" onClick={() => set({ mode: m, ...(m === 'price' && result.pricePerTon ? { price: String(round(result.pricePerTon, 2)) } : {}) })}
                  className={cn('flex-1 rounded px-2 py-1.5', s.mode === m ? 'bg-accent font-medium' : 'text-muted-foreground')}>
                  {m === 'margin' ? 'Set by margin %' : 'Set price per ton'}
                </button>
              ))}
            </div>
            {s.mode === 'margin'
              ? <Field label="Target margin %" hint="Margin = profit ÷ selling price"><Input inputMode="decimal" value={s.margin} onChange={(e) => set({ margin: e.target.value })} /></Field>
              : <Field label={`Price per ton (${s.sellCurrency})`}><Input inputMode="decimal" value={s.price} onChange={(e) => set({ price: e.target.value })} /></Field>}

            {result.problems.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                {result.problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{p}</li>)}
              </ul>
            )}

            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-left font-medium" /><th className="py-1 text-right font-medium">Cost</th><th className="py-1 text-right font-medium">Price</th></tr></thead>
              <tbody className="tabular-nums">
                <tr className="border-t border-border text-base font-semibold"><td className="py-2">Per ton</td><td className="py-2 text-right">{money(result.totalCostPerTon)}</td><td className="py-2 text-right text-primary">{money(result.pricePerTon)}</td></tr>
                <tr className="border-t border-border"><td className="py-1.5">Per kg</td><td className="py-1.5 text-right">{money(result.per.cost.kg, undefined, 3)}</td><td className="py-1.5 text-right">{money(result.per.price.kg, undefined, 3)}</td></tr>
                <tr className="border-t border-border"><td className="py-1.5">Per carton</td><td className="py-1.5 text-right">{money(result.per.cost.carton)}</td><td className="py-1.5 text-right">{money(result.per.price.carton)}</td></tr>
                <tr className="border-t border-border"><td className="py-1.5">Per pallet</td><td className="py-1.5 text-right">{money(result.per.cost.pallet)}</td><td className="py-1.5 text-right">{money(result.per.price.pallet)}</td></tr>
              </tbody>
            </table>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Profit / ton" value={money(result.grossProfitPerTon)} />
              <Stat label="Margin" value={result.marginPct == null ? '—' : `${result.marginPct.toFixed(1)}%`} warn={result.marginPct != null && result.marginPct < 0} />
              <Stat label="Markup" value={result.markupPct == null ? '—' : `${result.markupPct.toFixed(1)}%`} />
            </div>
            <p className="text-xs text-muted-foreground">
              {result.cartonsPerTon ? `${result.cartonsPerTon.toLocaleString(undefined, { maximumFractionDigits: 1 })} cartons per ton` : ''}
              {result.kgPerPallet ? ` · ${result.kgPerPallet.toLocaleString()} kg net per pallet` : ''}
            </p>

            {result.breakdown.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Cost breakdown per ton ({s.sellCurrency})</summary>
                <ul className="mt-2 space-y-1">
                  {result.breakdown.map((b) => <li key={b.component} className="flex justify-between"><span>{COMPONENTS[b.component].label}</span><span className="tabular-nums">{money(b.perTon)}</span></li>)}
                </ul>
              </details>
            )}

            {canSave && product && (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valid from"><Input type="date" value={s.validFrom} onChange={(e) => set({ validFrom: e.target.value })} /></Field>
                  <Field label="Valid until"><Input type="date" value={s.validUntil} onChange={(e) => set({ validUntil: e.target.value })} /></Field>
                </div>
                <Field label="Note"><Textarea className="min-h-[52px]" value={s.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
                <Button className="w-full" onClick={save} disabled={saving || !result.pricePerTon || result.problems.length > 0}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}Save as new price version
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {product && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" />Price history</CardTitle><CardDescription>Old versions are kept and never changed.</CardDescription></CardHeader>
            <CardContent>
              {!versions.length ? <p className="text-sm text-muted-foreground">No saved prices for this product yet.</p> : (
                <ul className="divide-y divide-border text-sm">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-primary" onClick={() => applyVersion(v)}>
                        <span>
                          <span className="font-medium">{v.incoterm ?? 'No Incoterm'}</span>
                          <span className="text-muted-foreground"> · {new Date(v.created_at).toLocaleDateString()}{v.variety ? ` · ${v.variety}` : ''}</span>
                          {v.source === 'imported' && <Badge className="ml-1">imported</Badge>}
                          {isExpired(v) && <Badge className="ml-1 border-red-200 bg-red-50 text-red-800">expired</Badge>}
                        </span>
                        <span className="tabular-nums">{money(v.price_per_ton, v.sell_currency)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md bg-muted px-2 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-semibold tabular-nums', warn && 'text-destructive')}>{value}</div>
    </div>
  )
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d
