import { tr } from '@/lib/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { archivedToast } from '@/lib/undo'
import { useAuth } from '@/lib/auth'
import { CONTAINER_MANAGERS } from '@/lib/roles'
import { CURRENCIES } from '@/lib/pricing'
import { activePackaging, fetchCatalog, type Product } from '@/lib/catalog'
import { airFreight, rateValidity, seaFreight, type FreightRate } from '@/lib/freight'
import { money } from '@/lib/prices'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { fromRow, SimpleFormDialog, toRow, type FieldSpec } from '@/components/ui/simple-form'
import { cn } from '@/lib/utils'

type Rate = FreightRate & { id: string; forwarder_id: string | null; carrier: string | null; origin_country: string; origin_port: string | null
  destination_country: string; destination_port: string | null; container_type: string | null; fees_note: string | null; transit_time: string | null
  valid_from: string | null; valid_until: string | null; source: string | null; notes: string | null; archived_at: string | null; updated_at: string }
type Fwd = Record<string, string | null> & { id: string; name: string; archived_at: string | null }

const VALIDITY = {
  valid: ['Valid', 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'],
  no_date: ['No end date', 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'],
  expired: ['Expired', 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'],
  future: ['Not yet valid', 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200'],
} as const

const F_FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Company name', required: true, span: 2 },
  { key: 'company_type', label: 'Type', type: 'select', options: ['', 'Freight Forwarder', 'Shipping Line', 'Airline', 'Logistics Provider', 'Customs Broker', 'Transport Company'].map((x) => ({ value: x, label: x || '—' })) },
  { key: 'services', label: 'Services', placeholder: 'Sea reefer, air, customs…' }, { key: 'country', label: 'Country' }, { key: 'city', label: 'City' },
  { key: 'ports', label: 'Ports / routes', span: 3 }, { key: 'contact_name', label: 'Contact person' }, { key: 'job_title', label: 'Job title' },
  { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone / WhatsApp' }, { key: 'website', label: 'Website' }, { key: 'notes', label: 'Notes', type: 'textarea', span: 3 },
]

export function Logistics() {
  const { hasRole } = useAuth()
  const canEdit = hasRole(...CONTAINER_MANAGERS)
  const [tab, setTab] = useState<'rates' | 'forwarders' | 'calc'>('rates')
  const [rates, setRates] = useState<Rate[] | null>(null)
  const [fwds, setFwds] = useState<Fwd[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState(''); const [mode, setMode] = useState(''); const [showExpired, setShowExpired] = useState(true)
  const [rateEdit, setRateEdit] = useState<Rate | null>(null); const [rateOpen, setRateOpen] = useState(false)
  const [fwdEdit, setFwdEdit] = useState<Fwd | null>(null); const [fwdOpen, setFwdOpen] = useState(false)

  const load = useCallback(() => Promise.all([
    supabase.from('shipping_rates').select('*').order('destination_country'), supabase.from('freight_forwarders').select('*').order('name'), fetchCatalog(),
  ]).then(([r, f, c]) => { if (r.error) throw r.error; if (f.error) throw f.error; setRates(r.data as Rate[]); setFwds(f.data as Fwd[]); setProducts(c.products) })
    .catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const fwdName = useMemo(() => Object.fromEntries(fwds.map((f) => [f.id, f.name])), [fwds])
  if (error) return <ErrorState message={error} />
  if (!rates) return <Loading />

  const rateFields: FieldSpec[] = [
    { key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'sea', label: 'Sea' }, { value: 'air', label: 'Air' }, { value: 'inland', label: 'Inland' }] },
    { key: 'forwarder_id', label: 'Forwarder', type: 'select', options: [{ value: '', label: '—' }, ...fwds.filter((f) => !f.archived_at).map((f) => ({ value: f.id, label: f.name }))] },
    { key: 'carrier', label: 'Shipping line / airline' },
    { key: 'origin_country', label: 'From country' }, { key: 'origin_port', label: 'From port / airport' }, { key: 'container_type', label: 'Container (sea)', placeholder: "40' Reefer" },
    { key: 'destination_country', label: 'To country', required: true }, { key: 'destination_port', label: 'To port / airport' }, { key: 'transit_time', label: 'Transit time' },
    { key: 'rate_per_container', label: 'Rate per container', type: 'number' }, { key: 'rate_per_kg', label: 'Rate per kg (air)', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'select', options: CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: 'min_charge', label: 'Minimum charge', type: 'number' }, { key: 'additional_fees', label: 'Extra fees (per container / shipment)', type: 'number' }, { key: 'fees_note', label: 'What the fees are' },
    { key: 'valid_from', label: 'Valid from', type: 'date' }, { key: 'valid_until', label: 'Valid until', type: 'date' }, { key: 'source', label: 'Source', placeholder: 'Who quoted it, when' },
    { key: 'notes', label: 'Notes', type: 'textarea', span: 3 },
  ]
  async function saveRate(v: Record<string, string>) {
    const { row, error } = toRow(v, ['rate_per_container', 'rate_per_kg', 'min_charge', 'additional_fees'])
    if (error) { toast.error(error); return false }
    if (row.mode === 'air' && row.rate_per_kg == null) { toast.error('Air rates need a rate per kg.'); return false }
    if (row.mode !== 'air' && row.rate_per_container == null && row.rate_per_kg == null) { toast.error('Enter the rate.'); return false }
    if (!row.valid_until && !window.confirm('No “valid until” date. The rate will be shown as “No end date”. Save anyway?')) return false
    const res = rateEdit ? await supabase.from('shipping_rates').update(row).eq('id', rateEdit.id).select('id') : await supabase.from('shipping_rates').insert(row).select('id')
    if (res.error || !res.data?.length) { toast.error(res.error?.message ?? 'Not allowed.'); return false }
    toast.success('Rate saved'); load(); return true
  }
  async function saveFwd(v: Record<string, string>) {
    const { row } = toRow(v)
    const res = fwdEdit ? await supabase.from('freight_forwarders').update(row).eq('id', fwdEdit.id).select('id') : await supabase.from('freight_forwarders').insert(row).select('id')
    if (res.error || !res.data?.length) { toast.error(res.error?.message.includes('name_uq') ? 'Already exists.' : res.error?.message ?? 'Not allowed.'); return false }
    toast.success('Saved'); load(); return true
  }
  async function archive(table: string, id: string) {
    const { error } = await supabase.from(table).update({ archived_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast.error(error.message)
    archivedToast(tr(table === 'shipping_rates' ? 'Rate' : 'Forwarder'), table, id, load); load()
  }

  const visible = rates.filter((r) => !r.archived_at && (!mode || r.mode === mode) && (showExpired || rateValidity(r) !== 'expired')
    && (!q.trim() || [r.destination_country, r.destination_port, r.origin_port, r.carrier, r.forwarder_id ? fwdName[r.forwarder_id] : ''].some((x) => (x ?? '').toLowerCase().includes(q.trim().toLowerCase()))))

  return (
    <>
      <PageHeader title="Shipping & Logistics" summary="Freight rates with their source and validity, forwarders, and a freight calculator."
        action={canEdit && tab !== 'calc' && <Button onClick={() => tab === 'rates' ? (setRateEdit(null), setRateOpen(true)) : (setFwdEdit(null), setFwdOpen(true))}><Plus />{tab === 'rates' ? 'Add rate' : 'Add forwarder'}</Button>} />
      <div className="mb-4 flex gap-1 border-b border-border">
        {([['rates', 'Shipping rates'], ['forwarders', 'Forwarders & carriers'], ['calc', 'Freight calculator']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === k ? 'border-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>

      {tab === 'rates' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-8" placeholder="Search destination, port, carrier…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="w-32"><Select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode"><option value="">All modes</option><option value="sea">Sea</option><option value="air">Air</option><option value="inland">Inland</option></Select></div>
            <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground"><input type="checkbox" className="size-4 accent-[#23856B]" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} />Show expired</label>
          </div>
          <Card><CardContent className="overflow-x-auto p-0">
            {!visible.length ? <div className="p-5"><Empty title="No shipping rates" hint={canEdit ? 'Add rates exactly as your forwarders quote them, with a valid-until date.' : undefined}
              action={canEdit && <Button onClick={() => { setRateEdit(null); setRateOpen(true) }}><Plus />Add rate</Button>} /></div> : (
              <table className="w-full min-w-[860px] text-sm">
                <thead><tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Route</th><th className="px-3 py-3 font-medium">Mode</th><th className="px-3 py-3 text-end font-medium">Rate</th><th className="px-3 py-3 font-medium">Transit</th><th className="px-3 py-3 font-medium">By</th><th className="px-3 py-3 font-medium">Validity</th><th className="px-3 py-3" />
                </tr></thead>
                <tbody>
                  {visible.map((r) => {
                    const v = rateValidity(r)
                    return (
                      <tr key={r.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50" onClick={() => { setRateEdit(r); setRateOpen(true) }}>
                        <td className="px-5 py-3"><div className="font-medium">{r.destination_port ? `${r.destination_port}, ` : ''}{r.destination_country}</div><div className="text-xs text-muted-foreground">from {r.origin_port ?? r.origin_country}</div></td>
                        <td className="px-3 py-3 capitalize text-muted-foreground">{r.mode}{r.container_type ? ` · ${r.container_type}` : ''}</td>
                        <td className="px-3 py-3 text-end tabular-nums">
                          {r.mode === 'air' ? `${money(r.rate_per_kg, r.currency)} / kg` : `${money(r.rate_per_container, r.currency, 0)} / container`}
                          {(r.min_charge || r.additional_fees) && <div className="text-xs text-muted-foreground">{r.min_charge ? `min ${money(r.min_charge, r.currency, 0)}` : ''}{r.additional_fees ? ` + fees ${money(r.additional_fees, r.currency, 0)}` : ''}</div>}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{r.transit_time ?? '—'}</td>
                        <td className="px-3 py-3 text-muted-foreground">{[r.forwarder_id && fwdName[r.forwarder_id], r.carrier].filter(Boolean).join(' · ') || '—'}<div className="text-xs">{r.source}</div></td>
                        <td className="px-3 py-3"><span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', VALIDITY[v][1])}>{VALIDITY[v][0]}</span><div className="mt-0.5 text-xs text-muted-foreground">{r.valid_until ? `until ${r.valid_until}` : ''}</div></td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>{canEdit && <Button variant="ghost" size="icon" aria-label="Archive" onClick={() => archive('shipping_rates', r.id)}><Archive /></Button>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent></Card>
        </>
      )}

      {tab === 'forwarders' && (
        <Card><CardContent className="p-0">
          {!fwds.filter((f) => !f.archived_at).length ? <div className="p-5"><Empty title="No forwarders yet" /></div> : (
            <ul className="divide-y divide-border">
              {fwds.filter((f) => !f.archived_at).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-accent/50">
                  <button className="min-w-0 flex-1 text-start" onClick={() => { setFwdEdit(f); setFwdOpen(true) }}>
                    <div className="font-medium">{f.name} <span className="text-xs font-normal text-muted-foreground">{f.company_type}</span></div>
                    <div className="text-xs text-muted-foreground">{[f.services, f.city, f.contact_name, f.phone, f.email].filter(Boolean).join(' · ')}</div>
                  </button>
                  <span className="text-xs text-muted-foreground">{rates.filter((r) => r.forwarder_id === f.id && !r.archived_at).length} rates</span>
                  {canEdit && <Button variant="ghost" size="icon" aria-label="Archive" onClick={() => archive('freight_forwarders', f.id)}><Archive /></Button>}
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      )}

      {tab === 'calc' && <FreightCalculator rates={rates.filter((r) => !r.archived_at)} products={products} fwdName={fwdName} />}

      <SimpleFormDialog open={rateOpen} onOpenChange={setRateOpen} title={rateEdit ? 'Shipping rate' : 'Add shipping rate'} fields={rateFields} readOnly={!canEdit}
        description="Enter the rate exactly as quoted. Rates without a valid-until date are flagged."
        initial={rateEdit ? fromRow(rateEdit as unknown as Record<string, unknown>, rateFields.map((f) => f.key)) : { mode: 'sea', origin_country: 'Egypt', currency: 'USD' }} onSubmit={saveRate} />
      <SimpleFormDialog open={fwdOpen} onOpenChange={setFwdOpen} title={fwdEdit ? fwdEdit.name : 'Add forwarder / carrier'} fields={F_FIELDS} readOnly={!canEdit}
        initial={fwdEdit ? fromRow(fwdEdit, F_FIELDS.map((f) => f.key)) : { country: 'Egypt' }} onSubmit={saveFwd} />
    </>
  )
}

function FreightCalculator({ rates, products, fwdName }: { rates: Rate[]; products: Product[]; fwdName: Record<string, string> }) {
  const [rateId, setRateId] = useState('')
  const [productId, setProductId] = useState('')
  const [v, setV] = useState({ cartons: '', gross: '', L: '', W: '', H: '', divisor: '6000', containers: '1', netTons: '' })
  const r = rates.find((x) => x.id === rateId)
  const n = (s: string) => (s.trim() === '' ? NaN : Number(s))
  function pickProduct(id: string) {
    setProductId(id)
    const pk = products.find((p) => p.id === id) ? activePackaging(products.find((p) => p.id === id)!)[0] : undefined
    if (pk) setV((x) => ({ ...x, gross: pk.gross_weight_kg?.toString() ?? '', L: pk.length_cm?.toString() ?? '', W: pk.width_cm?.toString() ?? '', H: pk.height_cm?.toString() ?? '',
      netTons: x.cartons && pk.net_weight_kg ? String((Number(x.cartons) * pk.net_weight_kg) / 1000) : x.netTons }))
  }
  const res = !r ? null : r.mode === 'air'
    ? airFreight(r, { cartons: n(v.cartons), grossKgPerCarton: n(v.gross), lengthCm: n(v.L) || null, widthCm: n(v.W) || null, heightCm: n(v.H) || null, divisor: n(v.divisor), netTons: n(v.netTons) || null })
    : seaFreight(r, { containers: n(v.containers), netTons: n(v.netTons) || null })
  const valid = r ? rateValidity(r) : null
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader><CardTitle>Shipment</CardTitle><CardDescription>Product packing fills in from Products. Everything can be changed.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Shipping rate" className="sm:col-span-2">
            <Select value={rateId} onChange={(e) => setRateId(e.target.value)}><option value="">Choose a saved rate…</option>
              {rates.map((x) => <option key={x.id} value={x.id}>{x.mode.toUpperCase()} · {x.destination_port ?? x.destination_country}{x.container_type ? ` · ${x.container_type}` : ''} · {x.forwarder_id ? fwdName[x.forwarder_id] : x.carrier ?? ''}{rateValidity(x) === 'expired' ? ' (expired)' : ''}</option>)}
            </Select>
          </Field>
          {r?.mode === 'air' ? (
            <>
              <Field label="Product (optional)" className="sm:col-span-2"><Select value={productId} onChange={(e) => pickProduct(e.target.value)}><option value="">—</option>{products.filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.product_type})</option>)}</Select></Field>
              <Field label="Cartons"><Input inputMode="numeric" value={v.cartons} onChange={(e) => setV({ ...v, cartons: e.target.value })} /></Field>
              <Field label="Gross kg per carton"><Input inputMode="decimal" value={v.gross} onChange={(e) => setV({ ...v, gross: e.target.value })} /></Field>
              <Field label="Carton L × W × H (cm)"><div className="flex gap-1"><Input inputMode="decimal" value={v.L} onChange={(e) => setV({ ...v, L: e.target.value })} aria-label="Length" /><Input inputMode="decimal" value={v.W} onChange={(e) => setV({ ...v, W: e.target.value })} aria-label="Width" /><Input inputMode="decimal" value={v.H} onChange={(e) => setV({ ...v, H: e.target.value })} aria-label="Height" /></div></Field>
              <Field label="Volumetric divisor" hint="Usually 6000; confirm with your airline/forwarder"><Input inputMode="numeric" value={v.divisor} onChange={(e) => setV({ ...v, divisor: e.target.value })} /></Field>
            </>
          ) : r ? (
            <Field label="Number of containers"><Input inputMode="numeric" value={v.containers} onChange={(e) => setV({ ...v, containers: e.target.value })} /></Field>
          ) : null}
          {r && <Field label="Net tons in the shipment (for freight per ton)"><Input inputMode="decimal" value={v.netTons} onChange={(e) => setV({ ...v, netTons: e.target.value })} /></Field>}
        </CardContent>
      </Card>
      <Card className="h-fit lg:col-span-2">
        <CardHeader><CardTitle>Estimated freight</CardTitle><CardDescription>{r ? `${r.currency} · ${r.source ?? 'source not recorded'}` : 'Choose a rate'}</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {valid === 'expired' && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">This rate expired on {r!.valid_until}. Ask for a new quote before using it.</p>}
          {valid === 'no_date' && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">This rate has no valid-until date. Confirm it is still current.</p>}
          {res && (
            <>
              {res.problems.map((p) => <p key={p} className="text-xs text-amber-700 dark:text-amber-300">{p}</p>)}
              {r!.mode === 'air' && (
                <dl className="grid grid-cols-2 gap-y-1">
                  <dt className="text-muted-foreground">Actual weight</dt><dd className="text-end tabular-nums">{res.actualKg?.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</dd>
                  <dt className="text-muted-foreground">Volumetric weight</dt><dd className="text-end tabular-nums">{res.volumetricKg != null ? res.volumetricKg.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' kg' : '—'}</dd>
                  <dt className="font-medium">Chargeable weight</dt><dd className="text-end font-medium tabular-nums">{res.chargeableKg?.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</dd>
                </dl>
              )}
              <dl className="grid grid-cols-2 gap-y-1 border-t border-border pt-2">
                <dt className="text-muted-foreground">Freight{res.minApplied ? ' (minimum charge)' : ''}</dt><dd className="text-end tabular-nums">{money(res.base, res.currency)}</dd>
                <dt className="text-muted-foreground">Extra fees</dt><dd className="text-end tabular-nums">{money(res.fees, res.currency)}</dd>
                <dt className="text-base font-semibold">Total</dt><dd className="text-end text-base font-semibold tabular-nums text-primary">{money(res.total, res.currency)}</dd>
                <dt className="text-muted-foreground">Per net ton</dt><dd className="text-end tabular-nums">{res.perNetTon != null ? money(res.perNetTon, res.currency) : '—'}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">Use “per net ton” as the Freight cost in Pricing → Calculator for CFR / CIF prices. This is an estimate from a saved rate, not a booking.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
