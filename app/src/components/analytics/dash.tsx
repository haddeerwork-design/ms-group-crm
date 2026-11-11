import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------
// Dashboard building blocks: soft white cards, tinted icon tiles,
// delta pills, smooth area trend and donut with legend.
// Categorical colours = dataviz reference palette (validated, fixed order).
// ---------------------------------------------------------------------
export const CATEGORICAL = { light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'], dark: ['#3987e5', '#d95926', '#199e70', '#c98500'] }
const TREND = { light: '#1baf7a', dark: '#199e70' }

export function useDark() {
  const [d, setD] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const o = new MutationObserver(() => setD(document.documentElement.classList.contains('dark')))
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => o.disconnect()
  }, [])
  return d
}
const compact = (v: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

export function Panel({ title, sub, action, children, className, bodyClass }: { title?: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn('rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.04)]', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            {title && <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>}
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('px-5 pb-5 pt-4', bodyClass)}>{children}</div>
    </section>
  )
}

export function DeltaPill({ value, invert = false, suffix }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value == null || !isFinite(value)) return <span className="text-xs text-muted-foreground">{suffix ? `— ${suffix}` : ''}</span>
  const up = value >= 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums',
        good ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300')}>
        <Icon className="size-3" />{Math.abs(value).toFixed(Math.abs(value) >= 10 ? 0 : 1)}%
      </span>
      {suffix}
    </span>
  )
}

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  blue: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
} as const
const BARS = { emerald: 'bg-emerald-600', blue: 'bg-sky-600', violet: 'bg-violet-600', amber: 'bg-amber-500', rose: 'bg-rose-600', teal: 'bg-teal-600' } as const
export type Tone = keyof typeof TONES

export function StatCard({ icon: Icon, tone, label, value, delta, deltaInvert, deltaSuffix, foot, progress, to }: {
  icon: LucideIcon; tone: Tone; label: string; value: React.ReactNode; delta?: number | null; deltaInvert?: boolean; deltaSuffix?: string
  foot?: React.ReactNode; progress?: { pct: number | null; label?: string }; to?: string
}) {
  const body = (
    <div className={cn('flex h-full flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.04)] transition-colors', to && 'hover:border-primary/40')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', TONES[tone])}><Icon className="size-5" /></span>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-[22px] font-semibold leading-tight tracking-tight tabular-nums">{value}</div>
        </div>
      </div>
      <div className="mt-2 min-h-[18px]">{delta !== undefined && <DeltaPill value={delta} invert={deltaInvert} suffix={deltaSuffix} />}</div>
      {foot && <div className="mt-1 text-xs text-muted-foreground">{foot}</div>}
      {progress && (
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full', BARS[tone])} style={{ width: `${Math.max(0, Math.min(100, progress.pct ?? 0))}%` }} />
            </div>
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{progress.label ?? (progress.pct == null ? '—' : `${Math.round(progress.pct)}%`)}</span>
          </div>
        </div>
      )}
    </div>
  )
  return to ? <a href={`#${to}`} className="block h-full">{body}</a> : body
}

type Pt = { label: string; value: number }
function TrendTip({ active, payload, unit }: { active?: boolean; payload?: { payload: Pt }[]; unit?: string }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-center shadow-lg">
      <div className="text-[11px] text-muted-foreground">{r.label}</div>
      <div className="text-sm font-semibold tabular-nums">{unit ? `${unit} ` : ''}{r.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
    </div>
  )
}

/** Smooth area trend, one series (time on x). */
export function AreaTrend({ data, unit, height = 260 }: { data: Pt[]; unit?: string; height?: number }) {
  const dark = useDark()
  const c = dark ? TREND.dark : TREND.light
  const ink = dark ? '#9aa8a3' : '#6b7672'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={0.28} />
            <stop offset="100%" stopColor={c} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke={dark ? '#26332f' : '#e7ebe9'} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: ink, fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={compact} tickLine={false} axisLine={false} tick={{ fill: ink, fontSize: 11 }} width={44} />
        <Tooltip content={<TrendTip unit={unit} />} cursor={{ stroke: ink, strokeDasharray: '3 3' }} />
        <Area type="monotone" dataKey="value" stroke={c} strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: dark ? '#0f1714' : '#fff', fill: c }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Donut with the total in the middle and a legend with values (≤ 4 slices). */
export function Donut({ data, centerLabel, centerValue }: { data: Pt[]; centerLabel: string; centerValue: React.ReactNode }) {
  const dark = useDark()
  const pal = dark ? CATEGORICAL.dark : CATEGORICAL.light
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative size-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={50} outerRadius={72} paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><div className="text-lg font-semibold tabular-nums">{centerValue}</div><div className="text-[11px] text-muted-foreground">{centerLabel}</div></div>
        </div>
      </div>
      <ul className="min-w-[140px] flex-1 space-y-2 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: pal[i % pal.length] }} />
            <span className="flex-1 truncate">{d.label}</span>
            <span className="tabular-nums text-muted-foreground">{d.value} <span className="text-xs">({total ? Math.round((d.value / total) * 100) : 0}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('') || '?'
