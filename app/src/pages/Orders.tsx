import { TV } from '@/lib/i18n'
import { Boxes, CheckCircle2, PackageCheck, Ship } from 'lucide-react'
import { StatCard } from '@/components/analytics/dash'
import { T } from '@/lib/i18n'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { QUOTE_WRITERS } from '@/lib/roles'
import { fetchOrders, orderTotal, STAGE_LABEL, STAGES, type Stage } from '@/lib/orders'
import { fmtDateDMY } from '@/lib/quotations'
import { money } from '@/lib/prices'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { usePersistentState } from '@/lib/usePersistentState'

const TONE: Partial<Record<Stage, string>> = { shipped: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900', arrived: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900', completed: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900', cancelled: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900' }

export function Orders() {
  const nav = useNavigate()
  const { hasRole } = useAuth()
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchOrders>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = usePersistentState('orders.q', ''); const [st, setSt] = usePersistentState('orders.stage', 'active')
  useEffect(() => { fetchOrders().then(setRows).catch((e) => setError(e.message)) }, [])
  const list = useMemo(() => (rows ?? []).filter((r) => (st === 'active' ? !['completed', 'cancelled'].includes(r.stage) : !st || r.stage === st)
    && (!q.trim() || [r.number, r.customer_company, r.customer_name, r.bl_awb_number, r.container_numbers, r.destination].some((x) => (x ?? '').toLowerCase().includes(q.trim().toLowerCase())))), [rows, q, st])
  const today = new Date().toISOString().slice(0, 10)
  return (
    <>
      <PageHeader title="Orders & Shipments" summary="From confirmed order to delivery: stage, shipment, documents and payments."
        action={hasRole(...QUOTE_WRITERS) && <Button onClick={() => nav('/orders/new')}><Plus />New order</Button>} />
      {rows && rows.length > 0 && (() => {
        const today = new Date().toISOString().slice(0, 10)
        const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
        const active = rows.filter((r) => !['completed', 'cancelled'].includes(r.stage)).length
        return (
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Boxes} tone="blue" label="Active orders" value={active} foot="Confirmed, not completed" />
            <StatCard icon={PackageCheck} tone="amber" label="Preparing & packing" value={rows.filter((r) => ['awaiting_advance', 'preparing', 'packing', 'ready', 'booked'].includes(r.stage)).length} foot="Before shipping" />
            <StatCard icon={Ship} tone="teal" label="In transit" value={rows.filter((r) => r.stage === 'shipped').length} foot={<TV k="{n} arriving in 7 days" v={{ n: rows.filter((r) => r.stage === 'shipped' && r.eta && r.eta >= today && r.eta <= week).length }} />} />
            <StatCard icon={CheckCircle2} tone="emerald" label="Completed" value={rows.filter((r) => r.stage === 'completed').length} foot="Delivered and closed" />
          </div>
        )
      })()}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-8" placeholder="Search order, buyer, B/L, container…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="w-48"><Select value={st} onChange={(e) => setSt(e.target.value)} aria-label="Stage"><option value="active">Active orders</option><option value="">All</option>{[...STAGES, 'cancelled' as const].map((s) => <option key={s} value={s}><T>{STAGE_LABEL[s]}</T></option>)}</Select></div>
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        {error ? <div className="p-5"><ErrorState message={error} /></div> : !rows ? <Loading /> : !list.length ? (
          <div className="p-5"><Empty title="No orders" hint="Create one from an issued proforma or an accepted quotation."
            action={hasRole(...QUOTE_WRITERS) && <><Button onClick={() => nav('/orders/new')}><Plus />New order</Button><Button variant="outline" onClick={() => nav('/quotations')}>Go to quotations</Button></>} /></div>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3 font-medium"><T>Order</T></th><th className="px-3 py-3 font-medium"><T>Buyer</T></th><th className="px-3 py-3 font-medium"><T>Shipment</T></th><th className="px-3 py-3 text-end font-medium"><T>Total</T></th><th className="px-3 py-3 font-medium"><T>Stage</T></th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50" onClick={() => nav(`/orders/${r.id}`)}>
                <td className="px-5 py-3"><div className="font-medium">{r.number}</div><div className="text-xs text-muted-foreground">{fmtDateDMY(r.order_date)}</div></td>
                <td className="px-3 py-3">{r.customer_company ?? r.customer_name ?? '—'}<div className="text-xs text-muted-foreground">{r.customer_country}</div></td>
                <td className="px-3 py-3 text-muted-foreground">{[r.shipping_method?.toUpperCase(), r.port_of_discharge ?? r.destination].filter(Boolean).join(' · ') || '—'}
                  {r.eta && <div className={cn('text-xs', r.eta < today && !['arrived', 'completed'].includes(r.stage) && 'text-destructive')}>ETA {fmtDateDMY(r.eta)}</div>}</td>
                <td className="px-3 py-3 text-end tabular-nums">{money(orderTotal(r), r.currency)}</td>
                <td className="px-3 py-3"><span className={cn('rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium', TONE[r.stage])}><T>{STAGE_LABEL[r.stage]}</T></span></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </CardContent></Card>
    </>
  )
}
