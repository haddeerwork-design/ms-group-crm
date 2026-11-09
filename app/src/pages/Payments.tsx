import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { PAYMENT_EDITORS } from '@/lib/roles'
import { CURRENCIES } from '@/lib/pricing'
import { outstandingByCurrency, PAY_KIND, paymentStatus, type Payment, type PayStatus } from '@/lib/orders'
import { money } from '@/lib/prices'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { SimpleFormDialog, toRow, type FieldSpec } from '@/components/ui/simple-form'
import { PaymentStatusBadge, RecordPaymentDialog } from '@/components/orders/PaymentParts'
import { cn } from '@/lib/utils'

export function Payments() {
  const { hasRole, session } = useAuth()
  const canEdit = hasRole(...PAYMENT_EDITORS)
  const [rows, setRows] = useState<Payment[] | null>(null)
  const [refs, setRefs] = useState<{ orders: { id: string; number: string; customer_company: string | null }[]; suppliers: { id: string; name: string }[]; fwds: { id: string; name: string }[] }>({ orders: [], suppliers: [], fwds: [] })
  const [error, setError] = useState<string | null>(null)
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [status, setStatus] = useState<'' | PayStatus | 'open'>('open')
  const [adding, setAdding] = useState(false)
  const [recording, setRecording] = useState<Payment | null>(null)
  const load = useCallback(() => Promise.all([supabase.from('payments').select('*').order('due_date', { nullsFirst: false }),
    supabase.from('sales_orders').select('id, number, customer_company').order('created_at', { ascending: false }),
    supabase.from('suppliers').select('id, name').is('archived_at', null).order('name'), supabase.from('freight_forwarders').select('id, name').is('archived_at', null).order('name')])
    .then(([p, o, s, f]) => { if (p.error) throw p.error; setRows(p.data as Payment[]); setRefs({ orders: o.data ?? [], suppliers: s.data ?? [], fwds: f.data ?? [] }) })
    .catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])
  const today = new Date().toISOString().slice(0, 10)
  const ord = useMemo(() => Object.fromEntries(refs.orders.map((o) => [o.id, o])), [refs])
  const sup = useMemo(() => Object.fromEntries([...refs.suppliers, ...refs.fwds].map((o) => [o.id, o.name])), [refs])
  if (error) return <ErrorState message={error} />
  if (!rows) return <Loading />
  const totals = outstandingByCurrency(rows, dir, today)
  const list = rows.filter((p) => p.direction === dir).filter((p) => { const s = paymentStatus(p, today); return status === 'open' ? ['unpaid', 'partial', 'overdue'].includes(s) : !status || s === status })

  const fields: FieldSpec[] = [
    { key: 'kind', label: 'Type', type: 'select', options: (dir === 'in' ? ['advance', 'balance', 'full', 'installment', 'other'] : ['supplier', 'freight', 'customs', 'expense', 'other']).map((k) => ({ value: k, label: PAY_KIND[k as keyof typeof PAY_KIND] })) },
    { key: 'order_id', label: 'Order', type: 'select', span: 2, options: [{ value: '', label: '—' }, ...refs.orders.map((o) => ({ value: o.id, label: `${o.number} ${o.customer_company ?? ''}` }))] },
    ...(dir === 'out' ? [
      { key: 'supplier_id', label: 'Supplier', type: 'select', options: [{ value: '', label: '—' }, ...refs.suppliers.map((s) => ({ value: s.id, label: s.name }))] } as FieldSpec,
      { key: 'forwarder_id', label: 'Forwarder', type: 'select', options: [{ value: '', label: '—' }, ...refs.fwds.map((s) => ({ value: s.id, label: s.name }))] } as FieldSpec,
    ] : []),
    { key: 'description', label: 'Description', span: dir === 'out' ? 1 : 3 },
    { key: 'amount_due', label: 'Amount due', type: 'number', required: true }, { key: 'currency', label: 'Currency', type: 'select', options: CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: 'due_date', label: 'Due date', type: 'date' }, { key: 'notes', label: 'Notes', span: 3 },
  ]
  async function add(v: Record<string, string>) {
    const { row, error } = toRow(v, ['amount_due'])
    if (error) { toast.error(error); return false }
    if (!(row.amount_due as number > 0)) { toast.error('Amount must be above 0.'); return false }
    const { error: e } = await supabase.from('payments').insert({ ...row, direction: dir, created_by: session?.user.id })
    if (e) { toast.error(e.message); return false }
    toast.success('Payment line added'); load(); return true
  }
  return (
    <>
      <PageHeader title="Payments" summary="Money expected from customers and owed to suppliers. Nothing is marked as paid until Finance records it."
        action={canEdit && <Button onClick={() => setAdding(true)}><Plus />{dir === 'in' ? 'Expected receipt' : 'Payment to make'}</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {(['in', 'out'] as const).map((d) => <Button key={d} variant={dir === d ? 'outline' : 'ghost'} size="sm" onClick={() => setDir(d)}>{d === 'in' ? 'Receivables (in)' : 'Payables (out)'}</Button>)}
        </div>
        <div className="w-44"><Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status"><option value="open">Open</option><option value="overdue">Overdue</option><option value="paid">Paid</option><option value="">All</option></Select></div>
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        {totals.length ? totals.map((t) => (
          <div key={t.currency} className="rounded-lg border border-border bg-card px-4 py-2.5">
            <div className="text-xs text-muted-foreground">{dir === 'in' ? 'Outstanding receivables' : 'Outstanding payables'} · {t.currency}</div>
            <div className="text-lg font-semibold tabular-nums">{money(t.outstanding, t.currency, 0)}</div>
            <div className={cn('text-xs', t.overdue ? 'text-destructive' : 'text-muted-foreground')}>{t.overdue ? `${money(t.overdue, t.currency, 0)} overdue` : 'nothing overdue'} · {t.count} lines</div>
          </div>
        )) : <div className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">Nothing outstanding</div>}
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        {!list.length ? <div className="p-5"><Empty title="No payment lines" /></div> : (
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3 font-medium">What</th><th className="px-3 py-3 font-medium">Due date</th><th className="px-3 py-3 text-right font-medium">Due</th><th className="px-3 py-3 text-right font-medium">Paid</th><th className="px-3 py-3 font-medium">Status</th><th /></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3"><div className="font-medium">{PAY_KIND[p.kind as keyof typeof PAY_KIND] ?? p.kind}{p.description ? ` — ${p.description}` : ''}</div>
                  <div className="text-xs text-muted-foreground">{p.order_id && ord[p.order_id] ? <Link className="hover:underline" to={`/orders/${p.order_id}`}>{ord[p.order_id].number}</Link> : null}{(p.supplier_id || p.forwarder_id) && ` · ${sup[p.supplier_id ?? p.forwarder_id!] ?? ''}`}{p.reference ? ` · ref ${p.reference}` : ''}</div></td>
                <td className="px-3 py-3">{p.due_date ?? '—'}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(p.amount_due, p.currency)}</td><td className="px-3 py-3 text-right tabular-nums">{money(p.amount_paid, p.currency)}</td>
                <td className="px-3 py-3"><PaymentStatusBadge s={paymentStatus(p, today)} /></td>
                <td className="px-3 py-3 text-right">{canEdit && !p.cancelled_at && <Button variant="outline" size="sm" onClick={() => setRecording(p)}><Wallet />Record</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </CardContent></Card>
      <SimpleFormDialog open={adding} onOpenChange={setAdding} title={dir === 'in' ? 'Expected receipt' : 'Payment to make'} fields={fields} initial={{ kind: dir === 'in' ? 'full' : 'supplier', currency: dir === 'in' ? 'USD' : 'EGP' }} onSubmit={add} />
      <RecordPaymentDialog payment={recording} onClose={() => setRecording(null)} onSaved={load} />
    </>
  )
}
