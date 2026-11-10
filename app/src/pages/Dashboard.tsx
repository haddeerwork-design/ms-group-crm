import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleDashed } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { CRM_ASSIGNERS } from '@/lib/roles'
import { supabase } from '@/lib/supabase'
import { LEAD_STATUS } from '@/lib/crm'
import { STAGE_LABEL, outstandingByCurrency } from '@/lib/orders'
import { taskBucket } from '@/lib/sales'
import {
  PRESETS, companyStats, currencies, fetchAnalytics, groupSales, inSeason, leadsByStatus, money, onTime, pct, quoteStats, rangeFor,
  salesByMonth, salesTotals, shipModes, upcomingShipments, type AnalyticsData, type Preset,
} from '@/lib/analytics'
import { PageHeader } from '@/components/layout/AppShell'
import { ChartCard, ColumnChart, Kpi, RankBars } from '@/components/analytics/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { ErrorState, Loading } from '@/components/ui/states'

const today = () => new Date().toISOString().slice(0, 10)

export function Dashboard() {
  const { profile, session, hasRole } = useAuth()
  const isManager = hasRole(...CRM_ASSIGNERS)
  const [raw, setRaw] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<Preset>(() => { try { return (localStorage.getItem('ms_dash_range') as Preset) || 'this_year' } catch { return 'this_year' } })
  const [person, setPerson] = useState('')
  const [ccy, setCcy] = useState('')
  useEffect(() => { fetchAnalytics().then(setRaw).catch((e) => setError(e.message)) }, [])
  useEffect(() => { try { localStorage.setItem('ms_dash_range', preset) } catch { /* ignore */ } }, [preset])

  const t = today()
  const r = rangeFor(preset, t)
  // Employee filter (managers only): narrows every number to that person's records.
  const d = useMemo(() => {
    if (!raw || !person) return raw
    return {
      ...raw, orders: raw.orders.filter((o) => o.created_by === person), quotes: raw.quotes.filter((q) => q.created_by === person),
      companies: raw.companies.filter((c) => c.owner_id === person), opps: raw.opps.filter((o) => o.owner_id === person),
      tasks: raw.tasks.filter((x) => x.assignee_id === person),
    }
  }, [raw, person])

  if (error) return <ErrorState message={error} />
  if (!d) return <Loading />

  const ccys = currencies(d.orders)
  const cur = ccy && ccys.includes(ccy) ? ccy : ccys[0] ?? 'USD'
  const names = Object.fromEntries(d.products.map((p) => [p.id, p.name]))
  const cs = companyStats(d.companies, r, t)
  const qs = quoteStats(d.quotes, r)
  const sales = salesTotals(d.orders, r)
  const confirmed = d.orders.filter((o) => o.stage !== 'cancelled' && r.from <= o.order_date && o.order_date <= r.to).length
  const outstanding = outstandingByCurrency(d.payments, 'in', t)
  const upcoming = upcomingShipments(d.orders, t)
  const ot = onTime(d.orders, r)
  const modes = shipModes(d.orders, r)
  const month = Number(t.slice(5, 7))
  const seasonal = d.products.filter((p) => !p.archived_at && p.availability !== 'discontinued' && inSeason(month, p.season_start_month, p.season_end_month))
  const myTasks = d.tasks.filter((x) => x.assignee_id === (person || session?.user.id)).filter((x) => ['overdue', 'today'].includes(taskBucket(x, t)))
  const pendingQuotes = d.quotes.filter((q) => q.status === 'sent').sort((a, b) => (a.valid_until ?? '').localeCompare(b.valid_until ?? ''))
  const recent = [...d.companies].filter((c) => !c.archived_at).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)

  return (
    <>
      <PageHeader title={`Welcome, ${profile?.full_name || profile?.email || ''}`} summary="Live numbers from the platform. Everything respects what your role is allowed to see." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Period" value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="w-40">
          {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {isManager && (
          <Select aria-label="Employee" value={person} onChange={(e) => setPerson(e.target.value)} className="w-48">
            <option value="">Whole team</option>
            {raw!.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}
        {ccys.length > 1 && (
          <Select aria-label="Currency for charts" value={cur} onChange={(e) => setCcy(e.target.value)} className="w-28">
            {ccys.map((c) => <option key={c}>{c}</option>)}
          </Select>
        )}
        <Link to="/reports" className="ml-auto text-sm text-primary hover:underline">Open reports →</Link>
      </div>
      {d.warnings.length > 0 && <p className="mb-3 text-xs text-muted-foreground">Some data could not be loaded: {d.warnings.join(' · ')}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Importers in CRM" value={cs.total} hint={`${cs.customers} active customers`} to="/crm" />
        <Kpi label="Active leads" value={cs.activeLeads} hint={`${cs.newInRange} new in period`} to="/crm" />
        <Kpi label="Follow-ups due" value={cs.followUpsDue} tone={cs.overdueFollowUps.length ? 'bad' : undefined} hint={`${cs.overdueFollowUps.length} overdue`} to="/crm" />
        <Kpi label="Quotations sent" value={qs.sent} hint={`${qs.waiting} waiting for answer`} to="/quotations" />
        <Kpi label="Quotation success" value={pct(qs.successRate)} hint={qs.decided ? `${qs.accepted} of ${qs.decided} decided` : 'No answers yet'} />
        <Kpi label="Lead → customer" value={pct(cs.conversionRate)} hint="Active customers ÷ all companies" />
        <Kpi label="Confirmed orders" value={confirmed} hint={PRESETS[preset]} to="/orders" />
        <Kpi label="Sales value" value={sales.length ? <span className="block text-lg leading-snug">{sales.map((s) => <span key={s.currency} className="block">{money(s.total, s.currency)}</span>)}</span> : '—'} hint="Per currency, not converted" />
        <Kpi label="Outstanding from customers" value={outstanding.length ? <span className="block text-lg leading-snug">{outstanding.map((o) => <span key={o.currency} className="block">{money(o.outstanding, o.currency)}</span>)}</span> : '—'}
          tone={outstanding.some((o) => o.overdue > 0) ? 'warn' : undefined} hint={outstanding.some((o) => o.overdue) ? `Overdue: ${outstanding.filter((o) => o.overdue).map((o) => money(o.overdue, o.currency)).join(' · ')}` : 'Nothing overdue'} to="/payments" />
        <Kpi label="Shipments next 30 days" value={upcoming.length} hint={ot.rate == null ? 'On-time: not measured yet' : `On-time: ${pct(ot.rate)}`} to="/orders" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title={`Sales by month (${cur})`} description="Confirmed orders, cancelled excluded.">
          {sales.length ? <ColumnChart data={salesByMonth(d.orders, r, cur)} unit={cur} /> : <p className="py-10 text-center text-sm text-muted-foreground">No orders in this period yet.</p>}
        </ChartCard>
        <ChartCard title="Leads by status" description="All non-archived companies.">
          <RankBars data={leadsByStatus(d.companies, LEAD_STATUS).filter((x) => x.value)} empty="No companies yet." />
        </ChartCard>
        <ChartCard title={`Top countries (${cur})`}><RankBars data={groupSales(d.orders, r, cur, 'country')} unit={cur} /></ChartCard>
        <ChartCard title={`Top products (${cur})`}><RankBars data={groupSales(d.orders, r, cur, 'product', names)} unit={cur} /></ChartCard>
        <ChartCard title="Shipping method" description="Orders in period.">
          <RankBars data={[{ label: 'Sea', value: modes.sea }, { label: 'Air', value: modes.air }, { label: 'Land', value: modes.land }, { label: 'Not set yet', value: modes.not_set }].filter((x) => x.value)} />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ListCard title="Today & overdue tasks" to="/tasks" empty="Nothing due. 🎉"
          rows={myTasks.slice(0, 6).map((x) => ({ key: x.id, main: x.title, side: x.due_date ?? '', bad: !!x.due_date && x.due_date < t }))} />
        <ListCard title="Overdue follow-ups" to="/crm" empty="No overdue follow-ups."
          rows={cs.overdueFollowUps.sort((a, b) => a.next_follow_up_date!.localeCompare(b.next_follow_up_date!)).slice(0, 6).map((c) => ({ key: c.id, main: c.name, side: c.next_follow_up_date!, to: `/crm/${c.id}`, bad: true }))} />
        <ListCard title="Recently added importers" to="/crm" empty="No companies yet."
          rows={recent.map((c) => ({ key: c.id, main: c.name, side: c.country ?? '', to: `/crm/${c.id}` }))} />
        <ListCard title="Quotations waiting for answer" to="/quotations" empty="No quotations waiting."
          rows={pendingQuotes.slice(0, 6).map((q) => ({ key: q.id, main: `${q.number} · ${q.customer_company ?? '—'}`, side: q.valid_until ? `valid to ${q.valid_until}` : '', to: `/quotations/${q.id}`, bad: !!q.valid_until && q.valid_until < t }))} />
        <ListCard title="Upcoming shipments" to="/orders" empty="No shipments in the next 30 days."
          rows={upcoming.slice(0, 6).map(({ o, date }) => ({ key: o.id, main: `${o.number} · ${o.customer_company ?? '—'}`, side: `${STAGE_LABEL[o.stage]} · ${date}`, to: `/orders/${o.id}` }))} />
        <ListCard title="In season this month" to="/products" empty="No product has a season covering this month."
          rows={seasonal.slice(0, 8).map((p) => ({ key: p.id, main: p.name, side: '' }))} />
      </div>

      {hasRole('super_admin') && <SetupStatus />}
    </>
  )
}

function ListCard({ title, to, rows, empty }: { title: string; to: string; empty: string; rows: { key: string; main: string; side: string; to?: string; bad?: boolean }[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-sm">{title}</CardTitle><Link to={to} className="text-xs text-primary hover:underline">View all</Link></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
          <ul className="divide-y divide-border text-sm">
            {rows.map((x) => (
              <li key={x.key} className="flex items-center gap-3 py-2">
                {x.to ? <Link to={x.to} className="truncate hover:underline">{x.main}</Link> : <span className="truncate">{x.main}</span>}
                <span className={`ml-auto shrink-0 text-xs tabular-nums ${x.bad ? 'text-destructive' : 'text-muted-foreground'}`}>{x.side}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const PLAN = [
  ['0001_foundation', 'Foundation'], ['0002_products', 'Products'], ['0003_pricing', 'Pricing'], ['0004_containers', 'Container planner'],
  ['0005_quotations', 'Quotations'], ['0006_crm', 'CRM'], ['0007_sales', 'Pipeline & tasks'], ['0008_logistics', 'Suppliers, logistics & proformas'],
  ['0009_operations', 'Orders & payments'], ['0010_research', 'Market research'], ['0011_production', 'Archive & security'], ['0012_product_specs', 'Product specs & packing'], ['0013_brands_unit_prices', 'Prime Roots & unit prices'], ['0014_quote_language_fx', 'Quotation language & currency'],
]
function SetupStatus() {
  const [applied, setApplied] = useState<Set<string> | null>(null)
  useEffect(() => { supabase.from('app_migrations').select('version').then(({ data }) => setApplied(new Set((data ?? []).map((x) => x.version)))) }, [])
  if (!applied || PLAN.every(([v]) => applied.has(v))) return null
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle className="text-sm">Database setup (only Super Admin sees this)</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {PLAN.map(([v, l]) => (
          <span key={v} className="flex items-center gap-1.5">
            {applied.has(v) ? <CheckCircle2 className="size-4 text-primary" /> : <CircleDashed className="size-4 text-destructive" />}
            <span className={applied.has(v) ? '' : 'font-medium text-destructive'}>{l}</span>
          </span>
        ))}
      </CardContent>
    </Card>
  )
}
