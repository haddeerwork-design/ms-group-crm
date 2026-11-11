import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, CheckCircle2, CircleDashed, FileText, Leaf, Ship, ShoppingCart, Target, Users, Wallet,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { CRM_ASSIGNERS } from '@/lib/roles'
import { supabase } from '@/lib/supabase'
import { LEAD_STATUS, todayISO } from '@/lib/crm'
import { STAGE_LABEL, outstandingByCurrency } from '@/lib/orders'
import {
  PRESETS, companyStats, currencies, deltaPct, employeePerformance, fetchAnalytics, groupSales, inRange, inSeason, leadsByStatus, onTime, pct,
  previousRange, quoteStats, rangeFor, salesByMonth, salesTotals, shipModes, upcomingShipments, type AnalyticsData, type Preset,
} from '@/lib/analytics'
import { MyDay } from '@/components/analytics/MyDay'
import { AreaTrend, DeltaPill, Donut, Panel, StatCard, initials } from '@/components/analytics/dash'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { ErrorState, Loading } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

const today = () => new Date().toISOString().slice(0, 10)
const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })
const short = (v: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

export function Dashboard() {
  const { profile, session, hasRole } = useAuth()
  const { t: tx } = useT()
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
  const prev = previousRange(r)
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
  if (!d || !raw) return <Loading />

  const ccys = currencies(d.orders)
  const cur = ccy && ccys.includes(ccy) ? ccy : ccys[0] ?? 'USD'
  const names = Object.fromEntries(d.products.map((p) => [p.id, p.name]))
  const cs = companyStats(d.companies, r, t)
  const qs = quoteStats(d.quotes, r)
  const sales = salesTotals(d.orders, r)
  const salesCur = sales.find((x) => x.currency === cur)?.total ?? 0
  const salesPrev = prev ? salesTotals(d.orders, prev).find((x) => x.currency === cur)?.total ?? 0 : null
  const orderCount = (rr: { from: string; to: string }) => d.orders.filter((o) => o.stage !== 'cancelled' && inRange(o.order_date, rr)).length
  const confirmed = orderCount(r)
  const csPrev = prev ? companyStats(d.companies, prev, t) : null
  const qsPrev = prev ? quoteStats(d.quotes, prev) : null
  const outstanding = outstandingByCurrency(d.payments, 'in', t)
  const outCur = outstanding.find((x) => x.currency === cur) ?? outstanding[0]
  const upcoming = upcomingShipments(d.orders, t)
  const ot = onTime(d.orders, r)
  const modes = shipModes(d.orders, r)
  const month = Number(t.slice(5, 7))
  const seasonal = d.products.filter((p) => !p.archived_at && p.availability !== 'discontinued' && inSeason(month, p.season_start_month, p.season_end_month))
  const pendingQuotes = d.quotes.filter((q) => q.status === 'sent').sort((a, b) => (a.valid_until ?? '').localeCompare(b.valid_until ?? ''))
  const leads = leadsByStatus(d.companies, LEAD_STATUS).filter((x) => x.value)
  const leadMax = Math.max(1, ...leads.map((x) => x.value))
  const products = groupSales(d.orders, r, cur, 'product', names, 6)
  const prodTotal = products.reduce((s, x) => s + x.value, 0)
  const team = isManager && !person
    ? employeePerformance(raw.team, r, { companies: d.companies, quotes: d.quotes, orders: d.orders, opps: d.opps, stages: d.stages })
        .filter((x) => x.newLeads || x.quotesSent || x.orders).sort((a, b) => (b.revenue.find((v) => v.currency === cur)?.total ?? 0) - (a.revenue.find((v) => v.currency === cur)?.total ?? 0))
    : []
  const teamMax = Math.max(1, ...team.map((x) => x.revenue.find((v) => v.currency === cur)?.total ?? 0))
  const modeData = [{ label: tx('Sea'), value: modes.sea }, { label: tx('Air'), value: modes.air }, { label: tx('Land'), value: modes.land }, { label: tx('Not set yet'), value: modes.not_set }].filter((x) => x.value)
  const vs = prev ? tx('vs previous period') : undefined
  const firstName = (profile?.full_name || profile?.email || '').split(/[\s@]/)[0]

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <h1 className="text-2xl font-semibold tracking-tight">{tx('Welcome back, {name}', { name: firstName })} 👋</h1>
          <p className="text-sm text-muted-foreground">{tx('Here is what is happening in the business')} · {tx(PRESETS[preset])}{person ? ` · ${raw.team.find((u) => u.id === person)?.name}` : ''}</p>
        </div>
        <Select aria-label={tx('Period')} value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="h-10 w-40 rounded-xl bg-card">
          {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{tx(v)}</option>)}
        </Select>
        {isManager && (
          <Select aria-label={tx('Employee')} value={person} onChange={(e) => setPerson(e.target.value)} className="h-10 w-44 rounded-xl bg-card">
            <option value="">{tx('Whole team')}</option>
            {raw.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}
        {ccys.length > 1 && (
          <Select aria-label={tx('Currency')} value={cur} onChange={(e) => setCcy(e.target.value)} className="h-10 w-24 rounded-xl bg-card">
            {ccys.map((c) => <option key={c}>{c}</option>)}
          </Select>
        )}
        <Link to="/reports" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"><BarChart3 className="size-4" />{tx('Reports')}</Link>
      </div>
      {d.warnings.length > 0 && <p className="mb-3 text-xs text-muted-foreground">Some data could not be loaded: {d.warnings.join(' · ')}</p>}

      {session && <MyDay data={raw} userId={session.user.id} today={todayISO()} name={profile?.full_name} />}

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={Wallet} tone="emerald" label={tx('Sales ({cur})', { cur })} value={sales.length ? short(salesCur) : '—'} to="/orders"
          delta={prev ? deltaPct(salesCur, salesPrev) : undefined} deltaSuffix={vs}
          foot={sales.length > 1 ? `${tx('Also:')} ${sales.filter((x) => x.currency !== cur).map((x) => `${x.currency} ${short(x.total)}`).join(' · ')}` : tx('Confirmed orders, not converted')} />
        <StatCard icon={ShoppingCart} tone="blue" label={tx('Confirmed orders')} value={confirmed} to="/orders"
          delta={prev ? deltaPct(confirmed, orderCount(prev)) : undefined} deltaSuffix={vs} foot={tx('{n} shipments in the next 30 days', { n: upcoming.length })} />
        <StatCard icon={Users} tone="violet" label={tx('Active leads')} value={cs.activeLeads} to="/crm"
          delta={prev ? deltaPct(cs.newInRange, csPrev?.newInRange) : undefined} deltaSuffix={tx('new leads vs previous')}
          foot={tx('{n} new · {total} importers in CRM', { n: cs.newInRange, total: cs.total })} />
        <StatCard icon={FileText} tone="amber" label={tx('Quotations sent')} value={qs.sent} to="/quotations"
          delta={prev ? deltaPct(qs.sent, qsPrev?.sent) : undefined} deltaSuffix={vs}
          foot={qs.decided ? tx('{a} accepted of {d} answered', { a: qs.accepted, d: qs.decided }) : tx('{n} waiting for an answer', { n: qs.waiting })}
          progress={{ pct: qs.successRate, label: `${pct(qs.successRate)} ${tx('win')}` }} />
        <StatCard icon={Target} tone="teal" label={tx('Lead → customer')} value={pct(cs.conversionRate)} to="/crm"
          foot={tx('{n} active customers', { n: cs.customers })} progress={{ pct: cs.conversionRate }} />
        <StatCard icon={AlertTriangle} tone="rose" label={tx('Receivables')} to="/payments"
          value={outCur ? `${outCur.currency} ${short(outCur.outstanding)}` : '—'}
          foot={outCur ? (outCur.overdue ? `${outCur.currency} ${short(outCur.overdue)} ${tx('overdue')}` : tx('Nothing overdue')) : tx('No open customer payments')}
          progress={outCur ? { pct: outCur.outstanding ? (outCur.overdue / outCur.outstanding) * 100 : 0, label: tx('overdue') } : undefined} />
      </div>

      {/* Trend + leads */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title={<span className="flex flex-wrap items-baseline gap-x-3">{tx('Sales overview')} <span className="text-2xl font-semibold tabular-nums">{cur} {fmt(salesCur)}</span>{prev && <DeltaPill value={deltaPct(salesCur, salesPrev)} suffix={vs} />}</span>}
          sub={tx('Confirmed orders by month, cancelled excluded')}>
          {sales.length ? <AreaTrend data={salesByMonth(d.orders, r, cur)} unit={cur} /> : <Empty text={tx('No orders in this period yet.')} />}
        </Panel>
        <Panel title={tx('Leads by status')} sub={tx('{n} companies · {f} follow-ups due', { n: cs.total, f: cs.followUpsDue })} action={<Link to="/pipeline" className="text-xs font-medium text-primary hover:underline">Pipeline</Link>}>
          {leads.length ? (
            <ul className="space-y-3">
              {leads.map((x) => (
                <li key={x.key}>
                  <div className="mb-1 flex justify-between text-sm"><span>{tx(x.label)}</span><span className="tabular-nums text-muted-foreground">{x.value}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${(x.value / leadMax) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : <Empty text={tx('No companies yet.')} />}
        </Panel>
      </div>

      {/* Products + shipping + team */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title={tx('Top products ({cur})', { cur })} sub={tx('Share of confirmed sales in the period')} action={<Link to="/reports" className="text-xs font-medium text-primary hover:underline">{tx('All products')}</Link>}>
          {products.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-start text-[11px] uppercase tracking-wide text-muted-foreground"><th className="pb-2 font-medium">{tx('Product')}</th><th className="pb-2 text-end font-medium">{tx('Sales')}</th><th className="w-28 pb-2 ps-3 font-medium">{tx('Share')}</th></tr></thead>
              <tbody className="divide-y divide-border/70">
                {products.map((x) => {
                  const share = prodTotal ? (x.value / prodTotal) * 100 : 0
                  return (
                    <tr key={x.label}>
                      <td className="max-w-0 truncate py-2.5 pe-2">{x.label}</td>
                      <td className="py-2.5 text-end tabular-nums">{short(x.value)}</td>
                      <td className="py-2.5 ps-3"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-[#1baf7a] dark:bg-[#199e70]" style={{ width: `${share}%` }} /></div><span className="w-8 text-end text-[11px] tabular-nums text-muted-foreground">{Math.round(share)}%</span></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <Empty text={tx('No sales in this period.')} />}
        </Panel>
        <Panel title={tx('Shipping method')} sub={ot.rate == null ? tx('On-time delivery: not measured yet') : tx('On-time delivery: {p} ({a} of {b})', { p: pct(ot.rate), a: ot.onTime, b: ot.measured })}>
          {modeData.length ? <Donut data={modeData} centerValue={modeData.reduce((s, x) => s + x.value, 0)} centerLabel={tx('orders')} /> : <Empty text={tx('No orders in this period.')} />}
        </Panel>
        {team.length > 0 ? (
          <Panel title={tx('Team performance')} sub={`${tx(PRESETS[preset])} · ${tx('sales in {cur}', { cur })}`} action={<Link to="/reports" className="text-xs font-medium text-primary hover:underline">{tx('Details')}</Link>}>
            <ul className="space-y-3">
              {team.slice(0, 6).map((u) => {
                const rev = u.revenue.find((v) => v.currency === cur)?.total ?? 0
                return (
                  <li key={u.id} className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{initials(u.name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-medium">{u.name}</span><span className="text-sm tabular-nums">{short(rev)}</span></div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${(rev / teamMax) * 100}%` }} /></div>
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', (u.successRate ?? 0) >= 50 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>{tx('{n} quotes', { n: u.quotesSent })} · {pct(u.successRate)}</span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>
        ) : (
          <Panel title={tx('In season this month')} sub={tx('Products whose season covers this month')} action={<Link to="/products" className="text-xs font-medium text-primary hover:underline">{tx('Products')}</Link>}>
            <Chips items={seasonal.map((p) => p.name)} empty={tx('No product has a season covering this month.')} />
          </Panel>
        )}
      </div>

      {/* Action lists */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ListPanel icon={FileText} title={tx('Quotations waiting')} to="/quotations" empty={tx('No quotations waiting.')}
          rows={pendingQuotes.slice(0, 6).map((q) => ({ key: q.id, main: `${q.number} · ${q.customer_company ?? '—'}`, side: q.valid_until ? (q.valid_until < t ? tx('expired') : tx('until {date}', { date: q.valid_until })) : '', to: `/quotations/${q.id}`, tone: q.valid_until && q.valid_until < t ? 'bad' as const : 'warn' as const }))} />
        <ListPanel icon={Ship} title={tx('Upcoming shipments')} to="/orders" empty={tx('No shipments in the next 30 days.')}
          rows={upcoming.slice(0, 6).map(({ o, date }) => ({ key: o.id, main: `${o.number} · ${o.customer_company ?? '—'}`, side: `${tx(STAGE_LABEL[o.stage])} · ${date}`, to: `/orders/${o.id}`, tone: 'info' as const }))} />
      </div>

      {team.length > 0 && (
        <Panel className="mt-4" title={<span className="flex items-center gap-2"><Leaf className="size-4 text-emerald-600" />{tx('In season this month')}</span>} action={<Link to="/products" className="text-xs font-medium text-primary hover:underline">{tx('Products')}</Link>}>
          <Chips items={seasonal.map((p) => p.name)} empty={tx('No product has a season covering this month.')} />
        </Panel>
      )}

      {hasRole('super_admin') && <SetupStatus />}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{text}</p>
}
function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return <div className="flex flex-wrap gap-2">{items.map((x) => <span key={x} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{x}</span>)}</div>
}

const ROW_TONE = {
  bad: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300', warn: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300', muted: 'bg-muted text-muted-foreground',
}
function ListPanel({ icon: Icon, title, to, rows, empty }: { icon: React.ComponentType<{ className?: string }>; title: string; to: string; empty: string; rows: { key: string; main: string; side: string; to?: string; tone: keyof typeof ROW_TONE }[] }) {
  const { t } = useT()
  return (
    <Panel title={<span className="flex items-center gap-2"><Icon className="size-4 text-muted-foreground" />{title}</span>} action={<Link to={to} className="text-xs font-medium text-primary hover:underline">{t('View all')}</Link>} bodyClass="pt-3">
      {rows.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{empty}</p> : (
        <ul className="space-y-1">
          {rows.map((x) => (
            <li key={x.key} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/60">
              {x.to ? <Link to={x.to} className="min-w-0 flex-1 truncate text-sm">{x.main}</Link> : <span className="min-w-0 flex-1 truncate text-sm">{x.main}</span>}
              {x.side && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums', ROW_TONE[x.tone])}>{x.side}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

const PLAN = [
  ['0001_foundation', 'Foundation'], ['0002_products', 'Products'], ['0003_pricing', 'Pricing'], ['0004_containers', 'Container planner'],
  ['0005_quotations', 'Quotations'], ['0006_crm', 'CRM'], ['0007_sales', 'Pipeline & tasks'], ['0008_logistics', 'Suppliers, logistics & proformas'],
  ['0009_operations', 'Orders & payments'], ['0010_research', 'Market research'], ['0011_production', 'Archive & security'], ['0012_product_specs', 'Product specs & packing'], ['0013_brands_unit_prices', 'Prime Roots & unit prices'], ['0014_quote_language_fx', 'Quotation language & currency'], ['0015_prime_roots_terms', 'Prime Roots terms'], ['0016_selling_prices', 'Selling prices'],
]
function SetupStatus() {
  const { t } = useT()
  const [applied, setApplied] = useState<Set<string> | null>(null)
  useEffect(() => { supabase.from('app_migrations').select('version').then(({ data }) => setApplied(new Set((data ?? []).map((x) => x.version)))) }, [])
  if (!applied || PLAN.every(([v]) => <T>applied.has(v))) return null
  return (
</T>    <Card className="mt-4">
      <CardHeader><CardTitle className="text-sm">{t('Database setup (only Super Admin sees this)')}</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {PLAN.map(([v, l]) => (
          <span key={v} className="flex items-center gap-1.5">
            {applied.has(v) ? <CheckCircle2 className="size-4 text-primary" /> : <CircleDashed className="size-4 text-destructive" />}
            <span className={applied.has(v) ? '' : 'font-medium text-destructive'}>{t(l)}</span>
          </span>
        ))}
      </CardContent>
    </Card>
  )
}
