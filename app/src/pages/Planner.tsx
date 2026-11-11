import { T } from '@/lib/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Copy, FileText, Loader2, Maximize2, Plus, Save, Search, Settings2, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { CONTAINER_MANAGERS, PLAN_EDIT_ALL, PLANNERS } from '@/lib/roles'
import { activePackaging, fetchCatalog, type Category, type Product } from '@/lib/catalog'
import { CURRENCIES, INCOTERMS, type Incoterm } from '@/lib/pricing'
import { fetchPriceList, isExpired, money, type PriceListRow } from '@/lib/prices'
import { fetchContainerTypes, fetchPlan, fetchPlans, type ContainerType, type Plan } from '@/lib/containers'
import { cartonsToUnit, computePlan, fmtKg, maxCartonsFor, type ContainerLimits, type PlanLine, type QtyUnit } from '@/lib/planner'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { ContainerTypesDialog } from '@/components/planner/ContainerTypesDialog'
import { cn } from '@/lib/utils'
import { useLeaveGuard } from '@/lib/useLeaveGuard'

const COLORS = ['#23856B', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6', '#EC4899', '#84CC16']
const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: string) => (v.trim() === '' || !isFinite(Number(v)) ? null : Number(v))
let keySeq = 0

type Row = {
  key: number; product_id: string; packaging_id: string; variety: string; qty_unit: QtyUnit; quantity: string
  net: string; gross: string; cpp: string; price: string; price_id: string | null; priceNote: string
}
type Meta = { id: string | null; name: string; container_type_id: string; container_count: string; customer_name: string; destination: string; incoterm: Incoterm; currency: string; notes: string; created_by: string | null }
const newMeta = (): Meta => ({ id: null, name: '', container_type_id: '', container_count: '1', customer_name: '', destination: '', incoterm: 'CIF', currency: 'USD', notes: '', created_by: null })

export function Planner() {
  const { hasRole, session } = useAuth()
  const navigate = useNavigate()
  const canPlan = hasRole(...PLANNERS)
  const editAll = hasRole(...PLAN_EDIT_ALL)
  const canManageTypes = hasRole(...CONTAINER_MANAGERS)

  const [base, setBase] = useState<{ products: Product[]; categories: Category[]; prices: PriceListRow[]; types: ContainerType[] } | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<Meta>(newMeta())
  const [rows, setRows] = useState<Row[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [typesOpen, setTypesOpen] = useState(false)
  const [q, setQ] = useState('')

  const loadBase = useCallback(() => Promise.all([fetchCatalog(), fetchPriceList(), fetchContainerTypes(), fetchPlans()])
    .then(([c, prices, types, pl]) => { setBase({ ...c, prices, types }); setPlans(pl) }).catch((e) => setError(e.message)), [])
  useEffect(() => { loadBase() }, [loadBase])

  const prod = useMemo(() => Object.fromEntries((base?.products ?? []).map((p) => [p.id, p])), [base])
  const type = base?.types.find((t) => t.id === meta.container_type_id) ?? null
  const isMine = !meta.created_by || meta.created_by === session?.user.id
  const canEdit = canPlan && (isMine || editAll)
  const upd = (patch: Partial<Meta>) => { setMeta((m) => ({ ...m, ...patch })); setDirty(true) }
  const updRow = (key: number, patch: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setDirty(true) }

  function findPrice(productId: string, packagingId: string, incoterm: Incoterm, currency: string) {
    const cands = (base?.prices ?? []).filter((p) => p.product_id === productId && p.sell_currency === currency && !isExpired(p))
    const exact = cands.find((p) => p.incoterm === incoterm && (p.packaging_id ?? '') === packagingId)
      ?? cands.find((p) => p.incoterm === incoterm)
    if (exact) return { price: s(exact.price_per_ton), price_id: exact.id, priceNote: `Price list · ${exact.incoterm}` }
    const other = cands[0]
    if (other) return { price: s(other.price_per_ton), price_id: other.id, priceNote: `⚠ Price is ${other.incoterm ?? 'without Incoterm'}, not ${incoterm}` }
    return { price: '', price_id: null, priceNote: `No ${incoterm} price in ${currency}` }
  }

  function fillFromProduct(productId: string, packagingId?: string): Partial<Row> {
    const p = prod[productId]
    if (!p) return { product_id: '' }
    const pk = activePackaging(p).find((x) => x.id === packagingId) ?? activePackaging(p)[0]
    return {
      product_id: productId, packaging_id: pk?.id ?? '', net: s(pk?.net_weight_kg), gross: s(pk?.gross_weight_kg), cpp: s(pk?.cartons_per_pallet),
      ...findPrice(productId, pk?.id ?? '', meta.incoterm, meta.currency),
    }
  }

  function addRow() {
    setRows((rs) => [...rs, { key: ++keySeq, product_id: '', packaging_id: '', variety: '', qty_unit: 'pallets', quantity: '', net: '', gross: '', cpp: '', price: '', price_id: null, priceNote: '' }])
    setDirty(true)
  }

  function repriceAll(incoterm: Incoterm, currency: string) {
    setRows((rs) => rs.map((r) => (r.product_id ? { ...r, ...findPrice(r.product_id, r.packaging_id, incoterm, currency) } : r)))
  }

  function confirmLeave() { return !dirty || window.confirm('You have unsaved changes. Continue without saving?') }
  function newPlan() { if (!confirmLeave()) return; setMeta(newMeta()); setRows([]); setDirty(false) }
  async function openPlan(id: string) {
    if (!confirmLeave()) return
    try {
      const p = await fetchPlan(id)
      setMeta({
        id: p.id, name: p.name, container_type_id: p.container_type_id ?? '', container_count: s(p.container_count), customer_name: p.customer_name ?? '',
        destination: p.destination ?? '', incoterm: p.incoterm ?? 'CIF', currency: p.currency ?? 'USD', notes: p.notes ?? '', created_by: p.created_by,
      })
      setRows((p.container_plan_items ?? []).map((it) => ({
        key: ++keySeq, product_id: it.product_id, packaging_id: it.packaging_id ?? '', variety: it.variety ?? '', qty_unit: it.qty_unit, quantity: s(it.quantity),
        net: s(it.net_weight_kg), gross: s(it.gross_weight_kg), cpp: s(it.cartons_per_pallet), price: s(it.price_per_ton), price_id: it.price_id,
        priceNote: it.price_id ? 'Saved with the plan' : it.price_per_ton != null ? 'Entered manually' : '',
      })))
      setDirty(false)
    } catch (e) { toast.error((e as Error).message) }
  }

  const limits: ContainerLimits | null = type ? {
    maxPallets: type.max_pallets, maxPayloadKg: Number(type.max_payload_kg), emptyPalletKg: Number(type.empty_pallet_kg),
    isReefer: type.is_reefer, count: Math.max(1, Math.floor(n(meta.container_count) ?? 1)),
  } : null
  const lines: PlanLine[] = rows.filter((r) => r.product_id).map((r) => ({
    name: prod[r.product_id]?.name ?? '?', productType: prod[r.product_id]?.product_type ?? 'fresh',
    netKg: n(r.net), grossKg: n(r.gross), cpp: n(r.cpp), qtyUnit: r.qty_unit, quantity: n(r.quantity), pricePerTon: n(r.price),
  }))
  const lineRows = rows.filter((r) => r.product_id)
  const result = computePlan(lines, limits)

  function fillRemaining(key: number) {
    if (!limits) return toast.error('Choose a container type first.')
    const i = lineRows.findIndex((r) => r.key === key)
    const max = maxCartonsFor(i, lines, limits)
    if (max == null) return toast.error('This product needs cartons per pallet and a weight first.')
    const v = cartonsToUnit(max, lines[i])
    if (v == null || max <= 0) return toast.error('No space left in the container.')
    updRow(key, { quantity: String(Math.round(v * 1000) / 1000) })
  }

  async function save() {
    if (!meta.name.trim()) return toast.error('Give the plan a name.')
    if (rows.some((r) => r.product_id && !(n(r.quantity)! > 0))) return toast.error('Every product needs a quantity above 0.')
    setSaving(true)
    const planRow = {
      name: meta.name.trim(), container_type_id: meta.container_type_id || null, container_count: limits?.count ?? 1,
      max_pallets: type?.max_pallets ?? null, max_payload_kg: type?.max_payload_kg ?? null, empty_pallet_kg: type?.empty_pallet_kg ?? null,
      customer_name: meta.customer_name.trim() || null, destination: meta.destination.trim() || null, incoterm: meta.incoterm,
      currency: meta.currency, notes: meta.notes.trim() || null,
    }
    let id = meta.id
    if (id) {
      const r = await supabase.from('container_plans').update(planRow).eq('id', id).select('id')
      if (r.error || !r.data?.length) { setSaving(false); return toast.error(r.error?.message ?? 'You cannot edit this plan.') }
      const d = await supabase.from('container_plan_items').delete().eq('plan_id', id)
      if (d.error) { setSaving(false); return toast.error(d.error.message) }
    } else {
      const r = await supabase.from('container_plans').insert({ ...planRow, created_by: session?.user.id }).select('id').single()
      if (r.error) { setSaving(false); return toast.error(r.error.message) }
      id = r.data.id
    }
    const items = lineRows.map((r, i) => ({
      plan_id: id, product_id: r.product_id, packaging_id: r.packaging_id || null, variety: r.variety || null,
      qty_unit: r.qty_unit, quantity: n(r.quantity), net_weight_kg: n(r.net), gross_weight_kg: n(r.gross),
      cartons_per_pallet: n(r.cpp) ? Math.round(n(r.cpp)!) : null, price_per_ton: n(r.price), price_id: r.price_id, sort_order: i,
    }))
    if (items.length) {
      const r = await supabase.from('container_plan_items').insert(items)
      if (r.error) { setSaving(false); return toast.error('Plan saved, but products failed: ' + r.error.message) }
    }
    setSaving(false); setDirty(false)
    toast.success('Plan saved')
    setMeta((m) => ({ ...m, id, created_by: m.created_by ?? session?.user.id ?? null }))
    fetchPlans().then(setPlans)
  }

  async function remove() {
    if (!meta.id || !window.confirm(`Delete the plan “${meta.name}”? This cannot be undone.`)) return
    const { error, data } = await supabase.from('container_plans').delete().eq('id', meta.id).select('id')
    if (error || !data?.length) return toast.error(error?.message ?? 'You cannot delete this plan.')
    toast.success('Plan deleted'); setDirty(false); setMeta(newMeta()); setRows([]); fetchPlans().then(setPlans)
  }

  function copySummary() {
    const L = [`${meta.name || 'Container plan'}${meta.customer_name ? ' — ' + meta.customer_name : ''}`,
      `${limits?.count ?? 1} × ${type?.name ?? '(no container)'} · ${meta.incoterm}${meta.destination ? ' ' + meta.destination : ''}`, '']
    lineRows.forEach((r, i) => {
      const lr = result.lines[i], p = prod[r.product_id]
      const pk = p ? activePackaging(p).find((x) => x.id === r.packaging_id) : undefined
      L.push(`• ${p?.name}${r.variety ? ' (' + r.variety + ')' : ''}${pk ? ' — ' + pk.label : ''}: ${lr.cartons?.toLocaleString() ?? '?'} cartons, ${lr.pallets?.toFixed(1) ?? '?'} pallets, ${lr.netKg != null ? (lr.netKg / 1000).toFixed(2) : '?'} t net${r.price ? ` @ ${r.price} ${meta.currency}/t` : ''}`)
    })
    L.push('', `Total: ${result.cartons.toLocaleString()} cartons · ${result.palletSpots}/${result.capacity.pallets} pallets · ${(result.netKg / 1000).toFixed(2)} t net · ${(result.grossKg / 1000).toFixed(2)} t gross`)
    if (result.value != null) L.push(`Value: ${money(result.value, meta.currency)}`)
    navigator.clipboard.writeText(L.join('\n')).then(() => toast.success('Summary copied'), () => toast.error('Could not copy'))
  }

  const grouped = useMemo(() => (base?.categories ?? []).map((c) => ({ c, items: (base?.products ?? []).filter((p) => p.category_id === c.id && !p.archived_at).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length), [base])
  const activeTypes = (base?.types ?? []).filter((t) => !t.archived_at || t.id === meta.container_type_id)
  const visiblePlans = plans.filter((p) => !q.trim() || (p.name + ' ' + (p.customer_name ?? '')).toLowerCase().includes(q.trim().toLowerCase()))

  useLeaveGuard(dirty, save)
  if (error) return <ErrorState message={error} />
  if (!base) return <Loading />

  return (
    <>
      <PageHeader title="Container Planner" summary="Plan single or mixed containers by pallets, cartons or tons."
        action={<div className="flex gap-2">
          <Button variant="outline" onClick={() => setTypesOpen(true)}><Settings2 />Container types</Button>
          {canPlan && <Button onClick={newPlan}><Plus />New plan</Button>}
        </div>} />

      {!base.types.filter((t) => !t.archived_at).length && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>No container types yet. {canManageTypes ? 'Click “Container types” and add the sizes you ship, with the limits your forwarder confirms.' : 'Ask the Sales Manager or Logistics to add them.'}</span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Saved plans</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="relative"><Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-8" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {!visiblePlans.length ? <p className="py-3 text-center text-xs text-muted-foreground"><T>No saved plans.</T></p> : (
              <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">
                {visiblePlans.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => openPlan(p.id)} className={cn('w-full rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent', meta.id === p.id && 'bg-accent')}>
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.customer_name || '—'} · {new Date(p.updated_at).toLocaleDateString()}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Plan name" className="sm:col-span-2"><Input value={meta.name} onChange={(e) => upd({ name: e.target.value })} placeholder="e.g. Jeddah — frozen mix Nov" /></Field>
                <Field label="Container type">
                  <Select value={meta.container_type_id} onChange={(e) => upd({ container_type_id: e.target.value })}>
                    <option value="">Choose…</option>{activeTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </Field>
                <Field label="Number of containers"><Input inputMode="numeric" value={meta.container_count} onChange={(e) => upd({ container_count: e.target.value })} /></Field>
                <Field label="Customer"><Input value={meta.customer_name} onChange={(e) => upd({ customer_name: e.target.value })} /></Field>
                <Field label="Destination"><Input value={meta.destination} onChange={(e) => upd({ destination: e.target.value })} /></Field>
                <Field label="Incoterm (for prices)">
                  <Select value={meta.incoterm} onChange={(e) => { const v = e.target.value as Incoterm; upd({ incoterm: v }); repriceAll(v, meta.currency) }}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</Select>
                </Field>
                <Field label="Currency">
                  <Select value={meta.currency} onChange={(e) => { upd({ currency: e.target.value }); repriceAll(meta.incoterm, e.target.value) }}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
                </Field>
              </fieldset>
              {type && <p className="mt-3 text-xs text-muted-foreground">{type.name}: {type.max_pallets} pallets{type.pallet_type ? ` (${type.pallet_type})` : ''} · {Number(type.max_payload_kg).toLocaleString()} kg payload · empty pallet {type.empty_pallet_kg} kg{type.is_reefer ? '' : ' · dry'}</p>}
              {!canEdit && meta.id && <p className="mt-3 text-xs text-muted-foreground"><T>Read-only: this plan belongs to another employee.</T></p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle>Products</CardTitle><CardDescription>Packing and price fill in automatically. Every field can be changed for this plan.</CardDescription></div>
              {canEdit && <Button variant="outline" size="sm" onClick={addRow}><Plus />Add product</Button>}
            </CardHeader>
            <CardContent className="space-y-3">
              {!rows.length && <Empty title="No products yet" hint={canEdit ? 'Click “Add product”.' : undefined} />}
              {rows.map((r) => {
                const p = prod[r.product_id]
                const idx = lineRows.findIndex((x) => x.key === r.key)
                const lr = idx >= 0 ? result.lines[idx] : null
                return (
                  <div key={r.key} className="rounded-md border border-border p-3">
                    <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-12">
                      <Field label="Product" className="sm:col-span-4">
                        <div className="flex items-center gap-2">
                          {idx >= 0 && <span className="size-3 shrink-0 rounded-sm" style={{ background: COLORS[idx % COLORS.length] }} />}
                          <Select value={r.product_id} onChange={(e) => updRow(r.key, { ...fillFromProduct(e.target.value), variety: '' })}>
                            <option value="">Choose…</option>
                            {grouped.map(({ c, items }) => <optgroup key={c.id} label={c.name}>{items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
                          </Select>
                        </div>
                      </Field>
                      <Field label="Packaging" className="sm:col-span-3">
                        <Select value={r.packaging_id} onChange={(e) => updRow(r.key, fillFromProduct(r.product_id, e.target.value))} disabled={!p}>
                          {p && !activePackaging(p).length && <option value="">None saved</option>}
                          {p && activePackaging(p).map((pk) => <option key={pk.id} value={pk.id}>{pk.label}</option>)}
                        </Select>
                      </Field>
                      <Field label="Variety" className="sm:col-span-2">
                        <Select value={r.variety} onChange={(e) => updRow(r.key, { variety: e.target.value })} disabled={!p?.varieties.length}>
                          <option value="">—</option>{p?.varieties.map((v) => <option key={v}>{v}</option>)}
                        </Select>
                      </Field>
                      <Field label="Quantity" className="sm:col-span-3">
                        <div className="flex gap-1">
                          <Input inputMode="decimal" value={r.quantity} onChange={(e) => updRow(r.key, { quantity: e.target.value })} />
                          <Select value={r.qty_unit} onChange={(e) => updRow(r.key, { qty_unit: e.target.value as QtyUnit })} className="w-[92px]" aria-label="Unit">
                            <option value="pallets">pallets</option><option value="cartons">cartons</option><option value="tons">tons</option>
                          </Select>
                        </div>
                      </Field>
                      <Field label="Net kg/carton" className="sm:col-span-2"><Input inputMode="decimal" value={r.net} onChange={(e) => updRow(r.key, { net: e.target.value })} /></Field>
                      <Field label="Gross kg/carton" className="sm:col-span-2"><Input inputMode="decimal" value={r.gross} onChange={(e) => updRow(r.key, { gross: e.target.value })} /></Field>
                      <Field label="Cartons / pallet" className="sm:col-span-2"><Input inputMode="numeric" value={r.cpp} onChange={(e) => updRow(r.key, { cpp: e.target.value })} /></Field>
                      <Field label={`Price / ton (${meta.currency})`} hint={r.priceNote} className="sm:col-span-3">
                        <Input inputMode="decimal" value={r.price} onChange={(e) => updRow(r.key, { price: e.target.value, price_id: null, priceNote: 'Entered manually' })} />
                      </Field>
                      <div className="flex items-end justify-end gap-1 sm:col-span-3">
                        {canEdit && r.product_id && <Button type="button" variant="outline" size="sm" onClick={() => fillRemaining(r.key)} title="Fill the space that is left"><Maximize2 />Fill</Button>}
                        {canEdit && <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); setDirty(true) }}><Trash2 /></Button>}
                      </div>
                    </fieldset>
                    {lr && (
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                        <span><b className="text-foreground">{lr.cartons?.toLocaleString() ?? '—'}</b> cartons</span>
                        <span><b className="text-foreground">{lr.pallets != null ? lr.pallets.toFixed(2) : '—'}</b> pallets ({lr.palletSpots ?? '—'} places)</span>
                        <span><b className="text-foreground">{lr.netKg != null ? (lr.netKg / 1000).toFixed(3) : '—'}</b> t net</span>
                        <span><b className="text-foreground">{lr.grossKg != null ? (lr.grossKg / 1000).toFixed(3) : '—'}</b> t gross</span>
                        <span>value <b className="text-foreground">{money(lr.value, meta.currency)}</b></span>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="size-4" />Load</CardTitle>
              <CardDescription>{limits ? `${limits.count} × ${type?.name}` : 'Choose a container type'}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Bar label="Pallet places" used={result.palletSpots} cap={result.capacity.pallets} unit="" usage={result.usage.pallets}
                segments={result.lines.map((l, i) => ({ v: l.palletSpots ?? 0, c: COLORS[i % COLORS.length] }))} />
              <Bar label="Gross weight" used={result.grossKg} cap={result.capacity.payloadKg} unit=" kg" usage={result.usage.weight}
                segments={result.lines.map((l, i) => ({ v: l.grossKg ?? 0, c: COLORS[i % COLORS.length] }))} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Stat label="Cartons" value={result.cartons.toLocaleString()} />
                <Stat label="Pallets" value={result.pallets.toFixed(2)} />
                <Stat label="Net" value={`${(result.netKg / 1000).toFixed(2)} t`} />
                <Stat label="Gross" value={`${(result.grossKg / 1000).toFixed(2)} t`} />
                <Stat label="Value" value={money(result.value, meta.currency, 0)} />
              </div>
              {limits && limits.count > 1 && <p className="text-xs text-muted-foreground">Per container (average): {(result.palletSpots / limits.count).toFixed(1)} pallet places · {fmtKg(result.grossKg / limits.count)} gross</p>}
              {result.warnings.length > 0 && (
                <ul className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <li key={i} className={cn('flex gap-2 rounded-md px-3 py-1.5 text-xs', w.level === 'error' ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100')}>
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{w.text}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {canEdit && <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{meta.id ? 'Save changes' : 'Save plan'}</Button>}
                <Button variant="outline" onClick={copySummary} disabled={!lineRows.length}><Copy />Copy summary</Button>
                {canPlan && meta.id && (
                  <Button variant="outline" onClick={() => dirty ? toast.error('Save the plan first.') : navigate(`/quotations/new?plan=${meta.id}`)}><FileText />Create quotation</Button>
                )}
                {canEdit && meta.id && <Button variant="ghost" className="ms-auto text-destructive" onClick={remove}><Trash2 />Delete plan</Button>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ContainerTypesDialog open={typesOpen} onOpenChange={setTypesOpen} types={base.types} canEdit={canManageTypes} onSaved={loadBase} />
    </>
  )
}

function Bar({ label, used, cap, unit, usage, segments }: { label: string; used: number; cap: number; unit: string; usage: number; segments: { v: number; c: string }[] }) {
  const total = Math.max(cap, used) || 1
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium"><T>{label}</T></span>
        <span className={cn('tabular-nums', usage > 1 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
          {Math.round(used).toLocaleString()}{unit} / {cap ? Math.round(cap).toLocaleString() + unit : '—'}{cap ? ` · ${Math.round(usage * 100)}%` : ''}
        </span>
      </div>
      <div className="relative flex h-3 overflow-hidden rounded-full bg-muted">
        {segments.map((s, i) => <div key={i} style={{ width: `${(s.v / total) * 100}%`, background: s.c }} />)}
        {used > cap && cap > 0 && <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${(cap / total) * 100}%` }} title="Limit" />}
      </div>
    </div>
  )
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted px-3 py-2"><div className="text-[11px] text-muted-foreground"><T>{label}</T></div><div className="text-sm font-semibold tabular-nums">{value}</div></div>
}
