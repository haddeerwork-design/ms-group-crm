import { useEffect, useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { CRM_ASSIGNERS } from '@/lib/roles'
import { LEAD_STATUS, download, toCSV } from '@/lib/crm'
import { STAGE_LABEL, paymentStatus } from '@/lib/orders'
import { STATUS_LABEL } from '@/lib/quotations'
import {
  PRESETS, currencies, employeePerformance, fetchAnalytics, groupSales, inRange, isSale, money, pct, quoteStats, rangeFor,
  salesByMonth, type AnalyticsData, type Preset,
} from '@/lib/analytics'
import { PageHeader } from '@/components/layout/AppShell'
import { ChartCard, ColumnChart, RankBars } from '@/components/analytics/charts'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ErrorState, Loading } from '@/components/ui/states'

const REPORTS = {
  sales_month: 'Sales by month', sales_country: 'Sales by country', sales_customer: 'Sales by customer', sales_product: 'Sales by product',
  sales_employee: 'Sales by employee', team: 'Employee performance', quotes: 'Quotations by status', leads_status: 'Leads by status',
  leads_country: 'Leads by country', shipments: 'Shipments & on-time delivery', receivables: 'Outstanding customer payments',
} as const
type ReportKey = keyof typeof REPORTS
type Col = { key: string; label: string; num?: boolean }
type Report = { cols: Col[]; rows: Record<string, string | number | null>[]; chart?: { label: string; value: number }[]; columns?: boolean; note?: string }

export function Reports() {
  const { hasRole } = useAuth()
  const isManager = hasRole(...CRM_ASSIGNERS)
  const [raw, setRaw] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rep, setRep] = useState<ReportKey>('sales_month')
  const [preset, setPreset] = useState<Preset>('this_year')
  const [ccy, setCcy] = useState('')
  const [person, setPerson] = useState('')
  useEffect(() => { fetchAnalytics().then(setRaw).catch((e) => setError(e.message)) }, [])
  const t = new Date().toISOString().slice(0, 10)
  const r = rangeFor(preset, t)

  const out = useMemo<Report | null>(() => {
    if (!raw) return null
    const d = person ? { ...raw, orders: raw.orders.filter((o) => o.created_by === person), quotes: raw.quotes.filter((q) => q.created_by === person), companies: raw.companies.filter((c) => c.owner_id === person) } : raw
    const ccys = currencies(d.orders)
    const cur = ccy && ccys.includes(ccy) ? ccy : ccys[0] ?? 'USD'
    const team = Object.fromEntries(raw.team.map((u) => [u.id, u.name]))
    const prod = Object.fromEntries(raw.products.map((p) => [p.id, p.name]))
    const money2 = (v: number) => Math.round(v * 100) / 100
    const group = (by: 'country' | 'customer' | 'employee' | 'product', label: string): Report => {
      const rows = groupSales(d.orders, r, cur, by, by === 'product' ? prod : team, 1000)
      return { cols: [{ key: 'label', label }, { key: 'value', label: `Sales (${cur})`, num: true }], rows: rows.map((x) => ({ ...x })), chart: rows.slice(0, 12) }
    }
    switch (rep) {
      case 'sales_month': { const m = salesByMonth(d.orders, r, cur); return { cols: [{ key: 'label', label: 'Month' }, { key: 'value', label: `Sales (${cur})`, num: true }], rows: m, chart: m, columns: true } }
      case 'sales_country': return group('country', 'Country')
      case 'sales_customer': return group('customer', 'Customer')
      case 'sales_product': return group('product', 'Product')
      case 'sales_employee': return group('employee', 'Employee')
      case 'team': {
        const rows = employeePerformance(person ? raw.team.filter((u) => u.id === person) : raw.team, r, { companies: d.companies, quotes: d.quotes, orders: d.orders, opps: raw.opps, stages: raw.stages })
        return {
          cols: [{ key: 'name', label: 'Employee' }, { key: 'newLeads', label: 'New leads', num: true }, { key: 'quotesSent', label: 'Quotes sent', num: true }, { key: 'quotesAccepted', label: 'Accepted', num: true },
            { key: 'success', label: 'Success rate', num: true }, { key: 'dealsWon', label: 'Deals won', num: true }, { key: 'orders', label: 'Orders', num: true }, { key: 'revenue', label: 'Sales' }],
          rows: rows.map((x) => ({ ...x, success: pct(x.successRate), revenue: x.revenue.map((v) => money(v.total, v.currency)).join(' · ') || '—' })),
          note: 'Sales are shown per currency and never added across currencies.',
        }
      }
      case 'quotes': {
        const q = quoteStats(d.quotes, r)
        const rows = (['draft', 'sent', 'accepted', 'rejected', 'expired', 'revised'] as const).map((s) => ({ label: STATUS_LABEL[s], value: d.quotes.filter((x) => x.status === s && inRange(x.issue_date, r)).length }))
        return { cols: [{ key: 'label', label: 'Status' }, { key: 'value', label: 'Quotations', num: true }], rows, chart: rows, note: `Success rate ${pct(q.successRate)} = accepted ÷ (accepted + rejected + expired).` }
      }
      case 'leads_status': {
        const rows = Object.entries(LEAD_STATUS).map(([k, label]) => ({ label, value: d.companies.filter((c) => !c.archived_at && c.lead_status === k).length }))
        return { cols: [{ key: 'label', label: 'Status' }, { key: 'value', label: 'Companies', num: true }], rows, chart: rows, note: 'Current status of every company (not limited by the period).' }
      }
      case 'leads_country': {
        const m = new Map<string, number>()
        for (const c of d.companies) if (!c.archived_at && inRange(c.created_at, r)) m.set(c.country?.trim() || 'Not set', (m.get(c.country?.trim() || 'Not set') ?? 0) + 1)
        const rows = [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
        return { cols: [{ key: 'label', label: 'Country' }, { key: 'value', label: 'New companies', num: true }], rows, chart: rows.slice(0, 12) }
      }
      case 'shipments': {
        const rows = d.orders.filter((o) => isSale(o) && inRange(o.order_date, r)).map((o) => ({
          number: o.number, customer: o.customer_company ?? '', method: o.shipping_method ?? '', stage: STAGE_LABEL[o.stage],
          departure: o.departure_date ?? '', eta: o.eta ?? '', arrival: o.arrival_date ?? '',
          result: o.arrival_date && o.eta ? (o.arrival_date <= o.eta ? 'On time' : 'Late') : '',
        }))
        const ok = rows.filter((x) => x.result === 'On time').length, late = rows.filter((x) => x.result === 'Late').length
        return {
          cols: [{ key: 'number', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'method', label: 'Method' }, { key: 'stage', label: 'Stage' }, { key: 'departure', label: 'Departure' }, { key: 'eta', label: 'ETA' }, { key: 'arrival', label: 'Arrived' }, { key: 'result', label: 'Result' }],
          rows, note: ok + late ? `On time: ${ok} of ${ok + late} (${pct((ok / (ok + late)) * 100)}). Only shipments with both ETA and arrival date count.` : 'No arrived shipments with both ETA and arrival date yet.',
        }
      }
      case 'receivables': {
        const orders = Object.fromEntries(raw.orders.map((o) => [o.id, o]))
        const rows = raw.payments.filter((p) => p.direction === 'in' && !p.cancelled_at && p.amount_due > p.amount_paid && (!person || orders[p.order_id ?? '']?.created_by === person)).map((p) => ({
          order: orders[p.order_id ?? '']?.number ?? '', customer: orders[p.order_id ?? '']?.customer_company ?? '', due_date: p.due_date ?? '',
          currency: p.currency, due: p.amount_due, paid: p.amount_paid, left: money2(p.amount_due - p.amount_paid), status: paymentStatus(p, t),
        })).sort((a, b) => a.due_date.localeCompare(b.due_date))
        return { cols: [{ key: 'order', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'due_date', label: 'Due' }, { key: 'currency', label: 'Ccy' }, { key: 'due', label: 'Amount', num: true }, { key: 'paid', label: 'Paid', num: true }, { key: 'left', label: 'Outstanding', num: true }, { key: 'status', label: 'Status' }], rows, note: 'All open customer payments today (not limited by the period).' }
      }
    }
  }, [raw, rep, preset, ccy, person]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorState message={error} />
  if (!raw || !out) return <Loading />
  const ccys = currencies(raw.orders)
  const isSales = rep.startsWith('sales_')
  const cur = ccy && ccys.includes(ccy) ? ccy : ccys[0] ?? 'USD'
  const total = isSales ? out.rows.reduce((s, x) => s + Number(x.value || 0), 0) : null

  function csv() {
    const rows = out!.rows.map((x) => Object.fromEntries(out!.cols.map((c) => [c.label, x[c.key]])))
    download(`${rep}-${preset}-${t}.csv`, toCSV(rows))
  }

  return (
    <>
      <PageHeader title="Reports" summary="Pick a report, set the period, then export to Excel (CSV) or print." />
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Select aria-label="Report" value={rep} onChange={(e) => setRep(e.target.value as ReportKey)} className="w-64">
          {Object.entries(REPORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select aria-label="Period" value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="w-40">
          {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {isSales && ccys.length > 1 && <Select aria-label="Currency" value={cur} onChange={(e) => setCcy(e.target.value)} className="w-28">{ccys.map((c) => <option key={c}>{c}</option>)}</Select>}
        {isManager && (
          <Select aria-label="Employee" value={person} onChange={(e) => setPerson(e.target.value)} className="w-48">
            <option value="">Whole team</option>{raw.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={csv} disabled={!out.rows.length}><Download />CSV</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer />Print</Button>
        </div>
      </div>

      <div className="mb-3 hidden print:block">
        <h1 className="text-lg font-semibold">MS El-brancy Group — {REPORTS[rep]}</h1>
        <p className="text-xs">{PRESETS[preset]} ({r.from === '0000-01-01' ? 'all' : `${r.from} → ${r.to}`}){person ? ` · ${raw.team.find((u) => u.id === person)?.name}` : ''} · printed {t}</p>
      </div>

      {out.chart && out.chart.some((x) => x.value) && (
        <ChartCard className="mb-4 print:break-inside-avoid" title={REPORTS[rep]} description={isSales ? `${cur} · ${PRESETS[preset]}` : PRESETS[preset]}>
          {out.columns ? <ColumnChart data={out.chart} unit={isSales ? cur : undefined} /> : <RankBars data={out.chart} unit={isSales ? cur : undefined} />}
        </ChartCard>
      )}
      {out.note && <p className="mb-2 text-xs text-muted-foreground">{out.note}</p>}
      <Card className="overflow-x-auto">
        {out.rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No data for this report and period.</p> : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>{out.cols.map((c) => <th key={c.key} className={`px-3 py-2 font-medium ${c.num ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {out.rows.map((x, i) => (
                <tr key={i}>{out.cols.map((c) => <td key={c.key} className={`px-3 py-2 ${c.num ? 'text-right tabular-nums' : ''}`}>{typeof x[c.key] === 'number' ? (x[c.key] as number).toLocaleString('en-US', { maximumFractionDigits: 2 }) : x[c.key] || '—'}</td>)}</tr>
              ))}
            </tbody>
            {total != null && (
              <tfoot className="border-t-2 border-border font-medium"><tr><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">{cur} {total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td></tr></tfoot>
            )}
          </table>
        )}
      </Card>
    </>
  )
}
