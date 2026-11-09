import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Download, FileUp, Loader2, Plus, Save, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { CRM_ASSIGNERS, PAYMENT_EDITORS, QUOTE_WRITERS } from '@/lib/roles'
import {
  DOC_TYPES, fetchOrder, orderTotal, PAY_KIND, PAY_METHOD, paymentStatus, safeFileName, splitSchedule, STAGE_LABEL, STAGES,
  type DocType, type Order, type OrderDoc, type Payment, type Stage,
} from '@/lib/orders'
import { lineAmount, type PriceUnit, type QtyUnitPI } from '@/lib/proformas'
import { fmtDateDMY } from '@/lib/quotations'
import { money } from '@/lib/prices'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { ErrorState, Loading } from '@/components/ui/states'
import { PaymentStatusBadge, RecordPaymentDialog } from '@/components/orders/PaymentParts'
import { cn } from '@/lib/utils'

type D = Awaited<ReturnType<typeof fetchOrder>>
const today = () => new Date().toISOString().slice(0, 10)

export function OrderDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { hasRole, session } = useAuth()
  const [d, setD] = useState<D | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'shipment' | 'documents' | 'payments' | 'history'>('overview')
  const [fwds, setFwds] = useState<{ id: string; name: string }[]>([])
  const load = useCallback(() => fetchOrder(id!).then(setD).catch((e) => setError(e.message)), [id])
  useEffect(() => { load(); supabase.from('freight_forwarders').select('id, name').is('archived_at', null).order('name').then(({ data }) => setFwds(data ?? [])) }, [load])

  if (error) return <ErrorState message={error.includes('0 rows') ? 'Order not found, or you do not have access to it.' : error} />
  if (!d) return <Loading />
  const o = d.order
  const closed = o.stage === 'completed' || o.stage === 'cancelled'
  const isOwnerOrManager = hasRole(...QUOTE_WRITERS) && (o.created_by === session?.user.id || hasRole(...CRM_ASSIGNERS))
  const isLogistics = hasRole('logistics_officer')
  const canEditCommercial = isOwnerOrManager && (!closed || hasRole(...CRM_ASSIGNERS))
  const canEditShipment = (isOwnerOrManager || isLogistics) && (!closed || hasRole(...CRM_ASSIGNERS))
  const total = orderTotal(o)
  const paidIn = d.payments.filter((p) => p.direction === 'in' && !p.cancelled_at).reduce((s, p) => s + Number(p.amount_paid), 0)

  async function patch(p: Partial<Order>, msg: string) {
    const { error, data } = await supabase.from('sales_orders').update(p).eq('id', o.id).select('id')
    if (error || !data?.length) return toast.error(error?.message ?? 'Not allowed.')
    toast.success(msg); load()
  }
  async function setStage(st: Stage) {
    if (st === 'cancelled' && !window.confirm('Cancel this order?')) return
    if (st === 'completed' && !window.confirm('Mark as completed? Only a manager can change it afterwards.')) return
    await patch({ stage: st, ...(st === 'arrived' && !o.arrival_date ? { arrival_date: today() } : {}) }, `Stage: ${STAGE_LABEL[st]}`)
  }
  const idx = STAGES.indexOf(o.stage as (typeof STAGES)[number])

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => nav('/orders')}><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{o.number} <span className="text-base font-normal text-muted-foreground">{o.customer_company ?? o.customer_name}</span></h1>
          <p className="text-sm text-muted-foreground">
            {fmtDateDMY(o.order_date)} · {o.incoterm ?? ''} {o.currency} · total <b className="text-foreground">{money(total, o.currency)}</b> · received <b className="text-foreground">{money(paidIn, o.currency)}</b>
            {o.company_id && <> · <Link className="text-primary hover:underline" to={`/crm/${o.company_id}`}>company</Link></>}
            {o.proforma_id && <> · <Link className="text-primary hover:underline" to={`/proformas/${o.proforma_id}`}>proforma</Link></>}
            {o.quotation_id && <> · <Link className="text-primary hover:underline" to={`/quotations/${o.quotation_id}`}>quotation</Link></>}
          </p>
        </div>
      </div>

      <Card className="mb-4"><CardContent className="pt-4">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {STAGES.map((s, i) => (
            <button key={s} disabled={!canEditShipment || o.stage === 'cancelled'} onClick={() => setStage(s)} title={canEditShipment ? `Move to ${STAGE_LABEL[s]}` : undefined}
              className={cn('flex min-w-[96px] flex-1 flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] font-medium transition-colors enabled:hover:bg-accent',
                o.stage === 'cancelled' ? 'text-muted-foreground' : i < idx ? 'text-primary' : i === idx ? 'bg-accent text-foreground' : 'text-muted-foreground')}>
              <span className={cn('grid size-6 place-items-center rounded-full border text-[10px]', i <= idx && o.stage !== 'cancelled' ? 'border-primary bg-primary text-white' : 'border-border')}>{i < idx ? <Check className="size-3" /> : i + 1}</span>
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{o.stage === 'cancelled' ? 'This order is cancelled.' : closed ? 'Completed orders are read-only for everyone except managers.' : 'Click a stage to move the order.'}</span>
          {canEditShipment && !closed && <button className="text-destructive hover:underline" onClick={() => setStage('cancelled')}>Cancel order</button>}
          {o.stage === 'cancelled' && hasRole(...CRM_ASSIGNERS) && <button className="text-primary hover:underline" onClick={() => setStage('confirmed')}>Re-open</button>}
        </div>
      </CardContent></Card>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {([['overview', 'Products'], ['shipment', 'Shipment'], ['documents', `Documents (${d.docs.length})`], ['payments', `Payments (${d.payments.length})`], ['history', 'History']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', tab === k ? 'border-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>
      {tab === 'overview' && <Items order={o} canEdit={canEditCommercial} onSaved={load} />}
      {tab === 'shipment' && <Shipment order={o} fwds={fwds} canEdit={canEditShipment} onSave={(p) => patch(p, 'Shipment details saved')} />}
      {tab === 'documents' && <Documents order={o} docs={d.docs} canUpload={canEditShipment || isOwnerOrManager} canDelete={hasRole(...CRM_ASSIGNERS)} onChange={load} />}
      {tab === 'payments' && <OrderPayments order={o} total={total} payments={d.payments} onChange={load} />}
      {tab === 'history' && (
        <Card><CardContent className="pt-5"><ol className="space-y-2 text-sm">
          {d.history.map((h) => <li key={h.id}><span className="text-muted-foreground">{new Date(h.changed_at).toLocaleString()}</span> — {h.from_stage ? `${STAGE_LABEL[h.from_stage]} → ` : ''}<b>{STAGE_LABEL[h.to_stage]}</b></li>)}
        </ol></CardContent></Card>
      )}
    </>
  )
}

let seq = 0
type Line = { key: number; product_id: string | null; description: string; packing: string; quantity: string; unit: QtyUnitPI; net: string; price: string; price_unit: PriceUnit }
function Items({ order, canEdit, onSaved }: { order: Order; canEdit: boolean; onSaved: () => void }) {
  const toLines = () => (order.order_items ?? []).map((i) => ({ key: ++seq, product_id: i.product_id, description: i.description, packing: i.packing ?? '', quantity: String(i.quantity), unit: i.unit, net: i.net_weight_kg?.toString() ?? '', price: String(i.unit_price), price_unit: i.price_unit }))
  const [lines, setLines] = useState<Line[]>(toLines)
  const [other, setOther] = useState(String(order.other_charges ?? 0))
  const [busy, setBusy] = useState(false)
  useEffect(() => { setLines(toLines()); setOther(String(order.other_charges ?? 0)) }, [order]) // eslint-disable-line react-hooks/exhaustive-deps
  const n = (v: string) => (v.trim() === '' || !isFinite(Number(v)) ? null : Number(v))
  const comp = lines.map((l) => ({ ...l, amount: lineAmount(n(l.quantity), l.unit, n(l.net), n(l.price), l.price_unit) }))
  const upd = (k: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...p } : l)))
  async function save() {
    for (const l of comp) if (!l.description.trim() || l.amount == null) return toast.error(`Check “${l.description || 'line'}”: description, quantity and price are needed.`)
    setBusy(true)
    const del = await supabase.from('order_items').delete().eq('order_id', order.id)
    if (del.error) { setBusy(false); return toast.error(del.error.message) }
    if (comp.length) {
      const ins = await supabase.from('order_items').insert(comp.map((l, i) => ({ order_id: order.id, product_id: l.product_id, description: l.description.trim(), packing: l.packing.trim() || null, quantity: n(l.quantity), unit: l.unit, net_weight_kg: n(l.net), unit_price: n(l.price), price_unit: l.price_unit, line_total: l.amount, sort_order: i })))
      if (ins.error) { setBusy(false); return toast.error(ins.error.message) }
    }
    await supabase.from('sales_orders').update({ other_charges: n(other) ?? 0 }).eq('id', order.id)
    setBusy(false); toast.success('Products saved'); onSaved()
  }
  const total = comp.reduce((s, l) => s + (l.amount ?? 0), 0) + (n(other) ?? 0)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Products</CardTitle>
        {canEdit && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: ++seq, product_id: null, description: '', packing: '', quantity: '', unit: 'tons', net: '', price: '', price_unit: 'ton' }])}><Plus />Add line</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Save</Button></div>}</CardHeader>
      <CardContent className="space-y-2">
        {comp.map((l) => (
          <fieldset key={l.key} disabled={!canEdit} className="grid items-end gap-2 rounded-md border border-border p-2 sm:grid-cols-12">
            <Field label="Description" className="sm:col-span-4"><Input value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} /></Field>
            <Field label="Packing" className="sm:col-span-2"><Input value={l.packing} onChange={(e) => upd(l.key, { packing: e.target.value })} /></Field>
            <Field label="Qty" className="sm:col-span-2"><div className="flex gap-1"><Input inputMode="decimal" value={l.quantity} onChange={(e) => upd(l.key, { quantity: e.target.value })} /><Select className="w-[76px]" value={l.unit} onChange={(e) => upd(l.key, { unit: e.target.value as QtyUnitPI })} aria-label="Unit"><option value="tons">t</option><option value="cartons">ctn</option><option value="kg">kg</option><option value="pieces">pcs</option></Select></div></Field>
            <Field label="Net kg/ctn" className="sm:col-span-1"><Input inputMode="decimal" value={l.net} onChange={(e) => upd(l.key, { net: e.target.value })} /></Field>
            <Field label={`Price (${order.currency})`} className="sm:col-span-2"><div className="flex gap-1"><Input inputMode="decimal" value={l.price} onChange={(e) => upd(l.key, { price: e.target.value })} /><Select className="w-[76px]" value={l.price_unit} onChange={(e) => upd(l.key, { price_unit: e.target.value as PriceUnit })} aria-label="Per"><option value="ton">/t</option><option value="kg">/kg</option><option value="carton">/ctn</option><option value="piece">/pc</option></Select></div></Field>
            <div className="flex items-center justify-end gap-1 pb-1 text-sm sm:col-span-1"><b className="tabular-nums">{l.amount != null ? money(l.amount, undefined, 0) : '—'}</b>{canEdit && <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></Button>}</div>
          </fieldset>
        ))}
        {!lines.length && <p className="text-sm text-muted-foreground">No lines yet.</p>}
        <div className="flex flex-wrap items-end justify-end gap-3 pt-2">
          <Field label="Other charges" className="w-40"><Input inputMode="decimal" disabled={!canEdit} value={other} onChange={(e) => setOther(e.target.value)} /></Field>
          <div className="pb-2 text-base">Total <b className="tabular-nums">{money(total, order.currency)}</b></div>
        </div>
      </CardContent>
    </Card>
  )
}

function Shipment({ order, fwds, canEdit, onSave }: { order: Order; fwds: { id: string; name: string }[]; canEdit: boolean; onSave: (p: Partial<Order>) => void }) {
  const keys = ['shipping_method', 'forwarder_id', 'carrier', 'origin', 'port_of_loading', 'destination', 'port_of_discharge', 'booking_number', 'departure_date', 'eta', 'arrival_date', 'bl_awb_number', 'container_numbers', 'shipment_notes'] as const
  const init = () => Object.fromEntries(keys.map((k) => [k, (order[k] as string | null) ?? ''])) as Record<(typeof keys)[number], string>
  const [v, setV] = useState(init)
  useEffect(() => setV(init()), [order]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: (typeof keys)[number]) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value })
  const inp = (k: (typeof keys)[number], label: string, type = 'text') => <Field label={label}><Input type={type} value={v[k]} onChange={set(k)} /></Field>
  return (
    <Card><CardHeader><CardTitle>Shipment</CardTitle><CardDescription>Logistics can update these fields and the stage.</CardDescription></CardHeader><CardContent>
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-3">
        <Field label="Method"><Select value={v.shipping_method} onChange={set('shipping_method')}><option value="">—</option><option value="sea">Sea</option><option value="air">Air</option><option value="land">Land</option></Select></Field>
        <Field label="Forwarder"><Select value={v.forwarder_id} onChange={set('forwarder_id')}><option value="">—</option>{fwds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
        {inp('carrier', 'Shipping line / airline')}{inp('origin', 'Origin')}{inp('port_of_loading', 'Port of loading')}{inp('booking_number', 'Booking number')}
        {inp('destination', 'Destination')}{inp('port_of_discharge', 'Port of discharge')}{inp('bl_awb_number', 'B/L or AWB number')}
        {inp('departure_date', 'Departure', 'date')}{inp('eta', 'Estimated arrival (ETA)', 'date')}{inp('arrival_date', 'Actual arrival', 'date')}
        <Field label="Container numbers" className="sm:col-span-3"><Input value={v.container_numbers} onChange={set('container_numbers')} placeholder="e.g. MSCU1234567, MSCU7654321" /></Field>
        <Field label="Notes" className="sm:col-span-3"><Textarea value={v.shipment_notes} onChange={set('shipment_notes')} /></Field>
        {canEdit && <div><Button onClick={() => onSave(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])) as Partial<Order>)}><Save />Save shipment</Button></div>}
      </fieldset>
    </CardContent></Card>
  )
}

function Documents({ order, docs, canUpload, canDelete, onChange }: { order: Order; docs: OrderDoc[]; canUpload: boolean; canDelete: boolean; onChange: () => void }) {
  const { session } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  async function upload(type: DocType, file: File) {
    if (file.size > 25 * 1024 * 1024) return toast.error('File is larger than 25 MB.')
    setBusy(type)
    const path = `${order.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const up = await supabase.storage.from('order-documents').upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (up.error) { setBusy(null); return toast.error('Upload failed: ' + up.error.message) }
    const meta = await supabase.from('order_documents').insert({ order_id: order.id, doc_type: type, file_path: path, file_name: file.name, size_bytes: file.size, mime_type: file.type || null, uploaded_by: session?.user.id })
    setBusy(null)
    if (meta.error) return toast.error('File stored, but not registered: ' + meta.error.message)
    toast.success(`${DOC_TYPES[type]} uploaded`); onChange()
  }
  async function open(d: OrderDoc) {
    const { data, error } = await supabase.storage.from('order-documents').createSignedUrl(d.file_path, 300, { download: d.file_name })
    if (error || !data) return toast.error(error?.message ?? 'Could not open the file.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  async function remove(d: OrderDoc) {
    if (!window.confirm(`Delete ${d.file_name}? This cannot be undone.`)) return
    const s = await supabase.storage.from('order-documents').remove([d.file_path])
    if (s.error) return toast.error(s.error.message)
    const m = await supabase.from('order_documents').delete().eq('id', d.id)
    if (m.error) return toast.error(m.error.message)
    toast.success('Deleted'); onChange()
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(Object.keys(DOC_TYPES) as DocType[]).map((t) => {
        const list = docs.filter((d) => d.doc_type === t)
        return (
          <Card key={t}><CardContent className="pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">{list.length ? <Check className="size-4 text-primary" /> : <span className="size-4 rounded-full border border-border" />}{DOC_TYPES[t]}</span>
              {canUpload && (
                <label className={cn('inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent', busy === t && 'pointer-events-none opacity-50')}>
                  {busy === t ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />}Upload
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(t, f) }} />
                </label>
              )}
            </div>
            {list.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 border-t border-border py-1.5 text-sm">
                <button className="flex min-w-0 items-center gap-1 text-left text-primary hover:underline" onClick={() => open(d)}><Download className="size-3.5 shrink-0" /><span className="truncate">{d.file_name}</span></button>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{new Date(d.uploaded_at).toLocaleDateString()}{canDelete && <Button variant="ghost" size="icon" className="size-7" aria-label="Delete" onClick={() => remove(d)}><Trash2 /></Button>}</span>
              </div>
            ))}
          </CardContent></Card>
        )
      })}
    </div>
  )
}

function OrderPayments({ order, total, payments, onChange }: { order: Order; total: number; payments: Payment[]; onChange: () => void }) {
  const { hasRole, session } = useAuth()
  const canEdit = hasRole(...PAYMENT_EDITORS)
  const [parts, setParts] = useState([{ kind: 'advance', percent: '50', due_date: today() }, { kind: 'balance', percent: '50', due_date: '' }])
  const [recording, setRecording] = useState<Payment | null>(null)
  const t = today()
  const incoming = useMemo(() => payments.filter((p) => p.direction === 'in'), [payments])
  async function createSchedule() {
    try {
      const rows = splitSchedule(total, parts.map((p) => ({ kind: p.kind, percent: Number(p.percent), due_date: p.due_date || null })))
      const { error } = await supabase.from('payments').insert(rows.map((r) => ({ direction: 'in', kind: r.kind, order_id: order.id, company_id: order.company_id, amount_due: r.amount, currency: order.currency, due_date: r.due_date, created_by: session?.user.id })))
      if (error) throw error
      toast.success('Payment schedule created'); onChange()
    } catch (e) { toast.error((e as Error).message) }
  }
  async function cancel(p: Payment) {
    if (!window.confirm('Cancel this payment line?')) return
    const { error } = await supabase.from('payments').update({ cancelled_at: new Date().toISOString() }).eq('id', p.id)
    if (error) return toast.error(error.message); onChange()
  }
  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle>From the customer</CardTitle><CardDescription>Order total {money(total, order.currency)}{order.payment_terms ? ` · terms: ${order.payment_terms}` : ''}</CardDescription></CardHeader><CardContent>
        {!incoming.length ? (
          canEdit ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No payment schedule yet. Split the total:</p>
              {parts.map((p, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <Field label="Part" className="w-36"><Select value={p.kind} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>{['advance', 'installment', 'balance', 'full'].map((k) => <option key={k} value={k}>{PAY_KIND[k as keyof typeof PAY_KIND]}</option>)}</Select></Field>
                  <Field label="%" className="w-20"><Input inputMode="decimal" value={p.percent} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} /></Field>
                  <Field label="Due" className="w-40"><Input type="date" value={p.due_date} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} /></Field>
                  <span className="pb-2 text-sm tabular-nums">{money((total * Number(p.percent || 0)) / 100, order.currency)}</span>
                  {parts.length > 1 && <Button variant="ghost" size="icon" aria-label="Remove part" onClick={() => setParts(parts.filter((_, j) => j !== i))}><Trash2 /></Button>}
                </div>
              ))}
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setParts([...parts, { kind: 'installment', percent: '', due_date: '' }])}><Plus />Add part</Button><Button size="sm" onClick={createSchedule} disabled={!total}>Create schedule</Button></div>
            </div>
          ) : <p className="text-sm text-muted-foreground">Finance has not added a payment schedule yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Part</th><th className="py-1 text-right">Due</th><th className="py-1 text-right">Paid</th><th className="py-1">Due date</th><th className="py-1">Status</th><th /></tr></thead>
            <tbody>{incoming.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-2">{PAY_KIND[p.kind as keyof typeof PAY_KIND] ?? p.kind}{p.reference && <div className="text-xs text-muted-foreground">{PAY_METHOD[p.method as keyof typeof PAY_METHOD]} · {p.reference} · {p.paid_date}</div>}</td>
                <td className="py-2 text-right tabular-nums">{money(p.amount_due, p.currency)}</td><td className="py-2 text-right tabular-nums">{money(p.amount_paid, p.currency)}</td>
                <td className="py-2">{p.due_date ?? '—'}</td><td className="py-2"><PaymentStatusBadge s={paymentStatus(p, t)} /></td>
                <td className="py-2 text-right">{canEdit && !p.cancelled_at && <><Button variant="outline" size="sm" onClick={() => setRecording(p)}><Wallet />Record</Button><Button variant="ghost" size="sm" onClick={() => cancel(p)}>Cancel</Button></>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Supplier, freight and other costs for this order are recorded on the Payments page (money out).</p>
      <RecordPaymentDialog payment={recording} onClose={() => setRecording(null)} onSaved={onChange} />
    </div>
  )
}
