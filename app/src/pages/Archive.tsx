import { useEffect, useMemo, useState } from 'react'
import { Archive as ArchiveIcon, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { cn } from '@/lib/utils'

type Row = { record_type: string; record_key: string; data: Record<string, unknown>; owner_legacy_id: string | null; archived_at: string }
type Doc = { type?: string; number?: string; date?: string; validUntil?: string; customerName?: string; currency?: string; total?: number | string; status?: string; createdBy?: string
  paymentTerms?: string; deliveryTerms?: string; notes?: string; products?: Record<string, unknown>[]; customer?: Record<string, unknown> }
type Act = { date?: string; user?: string; action?: string; detail?: string }

const TABS = { documents: 'Quotations & invoices', activity: 'Activity log', other: 'Other records' } as const
const s = (v: unknown) => (v == null ? '' : String(v))

export function Archive() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<keyof typeof TABS>('documents')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Row | null>(null)
  useEffect(() => {
    // PostgREST returns at most 1000 rows per call; page through everything.
    (async () => {
      const all: Row[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('legacy_archive').select('*').range(from, from + 999)
        if (error) { setError(/legacy_archive/.test(error.message) ? 'The archive is not installed yet. Run migration 0011_production in Supabase first.' : error.message); return }
        all.push(...(data as Row[]))
        if (!data || data.length < 1000) break
      }
      setRows(all)
    })()
  }, [])
  const last = useMemo(() => rows?.reduce((m, r) => (r.archived_at > m ? r.archived_at : m), '') ?? '', [rows])
  if (error) return <ErrorState message={error} />
  if (!rows) return <Loading />

  const t = q.trim().toLowerCase()
  const match = (r: Row) => !t || JSON.stringify(r.data).toLowerCase().includes(t)
  const docs = rows.filter((r) => r.record_type === 'documents' && match(r)).sort((a, b) => s((b.data as Doc).date).localeCompare(s((a.data as Doc).date)))
  const acts = rows.filter((r) => r.record_type === 'activity' && match(r)).sort((a, b) => Number(b.record_key) - Number(a.record_key))
  const counts = rows.reduce<Record<string, number>>((m, r) => { m[r.record_type] = (m[r.record_type] ?? 0) + 1; return m }, {})

  return (
    <>
      <PageHeader title="Old CRM archive" summary={`Read-only copy of the current CRM, kept after it is switched off.${last ? ` Last copied ${new Date(last).toLocaleString()}.` : ''} You see what your role allowed in the old CRM.`} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {Object.entries(TABS).map(([k, v]) => (
            <button key={k} onClick={() => setTab(k as keyof typeof TABS)} className={cn('rounded px-3 py-1.5 text-sm', tab === k ? 'bg-accent font-medium' : 'text-muted-foreground')}>{v}</button>
          ))}
        </div>
        {tab !== 'other' && <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search number, customer…" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      </div>

      {tab === 'documents' && (docs.length === 0 ? <Empty title="No old quotations or invoices" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Number</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">By</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.map((r) => { const d = r.data as Doc; return (
                <tr key={r.record_key} className="cursor-pointer hover:bg-accent/50" onClick={() => setOpen(r)}>
                  <td className="px-3 py-2 font-medium">{s(d.number) || '—'}</td>
                  <td className="px-3 py-2">{d.type === 'QUOTE' ? 'Quotation' : d.type === 'INVOICE' ? 'Invoice' : s(d.type)}</td>
                  <td className="px-3 py-2 tabular-nums">{s(d.date)}</td>
                  <td className="px-3 py-2">{s(d.customerName)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(d.total) ? `${s(d.currency)} ${Number(d.total).toLocaleString('en-US')}` : '—'}</td>
                  <td className="px-3 py-2"><Badge>{s(d.status) || '—'}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground">{s(d.createdBy)}</td>
                </tr>
              ) })}
            </tbody>
          </table>
        </Card>
      ))}

      {tab === 'activity' && (acts.length === 0 ? <Empty title="No activity" /> : (
        <Card><ul className="divide-y divide-border text-sm">
          {acts.slice(0, 500).map((r) => { const a = r.data as Act; return (
            <li key={r.record_key} className="flex gap-3 px-4 py-2"><span className="w-40 shrink-0 text-xs text-muted-foreground">{s(a.date)}</span><span className="w-32 shrink-0">{s(a.user)}</span><span><span className="font-medium">{s(a.action)}</span> {s(a.detail)}</span></li>
          ) })}
          {acts.length > 500 && <li className="px-4 py-2 text-xs text-muted-foreground">Showing the latest 500 of {acts.length}. Use search to find older ones.</li>}
        </ul></Card>
      ))}

      {tab === 'other' && (
        <Card className="p-5">
          <p className="mb-3 text-sm text-muted-foreground">These records were also copied. Customers, leads, products, suppliers and shipping data were already moved into the new modules.</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            {Object.entries(counts).sort().map(([k, n]) => <li key={k} className="flex items-center gap-2"><ArchiveIcon className="size-4 text-muted-foreground" />{k}<span className="ml-auto tabular-nums">{n}</span></li>)}
          </ul>
        </Card>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          {open && <DocDetail d={open.data as Doc} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function DocDetail({ d }: { d: Doc }) {
  const items = Array.isArray(d.products) ? d.products : []
  const cols = [...new Set(items.flatMap((i) => Object.keys(i)))].filter((k) => !['id'].includes(k)).slice(0, 8)
  return (
    <>
      <DialogHeader><DialogTitle>{s(d.number)} · {s(d.customerName)}</DialogTitle></DialogHeader>
      <DialogBody className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
          {[['Date', d.date], ['Valid until', d.validUntil], ['Currency', d.currency], ['Total', d.total], ['Status', d.status], ['Created by', d.createdBy], ['Payment terms', d.paymentTerms], ['Delivery terms', d.deliveryTerms]]
            .filter(([, v]) => s(v)).map(([k, v]) => <div key={s(k)} className="flex gap-2"><dt className="text-muted-foreground">{s(k)}:</dt><dd>{s(v)}</dd></div>)}
        </dl>
        {items.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left"><tr>{cols.map((c) => <th key={c} className="px-2 py-1.5 font-medium">{c}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">{items.map((i, n) => <tr key={n}>{cols.map((c) => <td key={c} className="px-2 py-1.5">{typeof i[c] === 'object' ? JSON.stringify(i[c]) : s(i[c])}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
        {d.notes && <p className="whitespace-pre-wrap text-muted-foreground">{d.notes}</p>}
      </DialogBody>
    </>
  )
}
