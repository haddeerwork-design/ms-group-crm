import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Single-series bars use one validated hue per theme (dataviz reference palette, green slot).
const BAR = { light: '#1baf7a', dark: '#199e70' }
function useDark() {
  const [d, setD] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const o = new MutationObserver(() => setD(document.documentElement.classList.contains('dark')))
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => o.disconnect()
  }, [])
  return d
}
const compact = (v: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

type Row = { label: string; value: number }

function Tip({ active, payload, unit }: { active?: boolean; payload?: { payload: Row }[]; unit?: string }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-md">
      <div className="font-medium">{r.label}</div>
      <div className="tabular-nums text-muted-foreground">{unit ? `${unit} ` : ''}{r.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
    </div>
  )
}

/** Vertical bars (time on the x axis). */
export function ColumnChart({ data, unit, height = 240 }: { data: Row[]; unit?: string; height?: number }) {
  const dark = useDark()
  const ink = dark ? '#9aa8a3' : '#6b7672'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={dark ? '#26332f' : '#e7ebe9'} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: ink, fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={compact} tickLine={false} axisLine={false} tick={{ fill: ink, fontSize: 11 }} width={44} />
        <Tooltip content={<Tip unit={unit} />} cursor={{ fill: dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)' }} />
        <Bar dataKey="value" fill={dark ? BAR.dark : BAR.light} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Horizontal ranked bars, labels on the left, value on the right (no colour-only meaning). */
export function RankBars({ data, unit, empty = 'No data in this period.' }: { data: Row[]; unit?: string; empty?: string }) {
  const max = Math.max(0, ...data.map((d) => d.value))
  if (!data.length || max === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm" title={`${d.label}: ${d.value.toLocaleString('en-US')}`}>
          <span className="truncate text-muted-foreground">{d.label}</span>
          <span className="h-2.5 rounded-e bg-muted">
            <span className="block h-full rounded-e bg-[#1baf7a] dark:bg-[#199e70]" style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }} />
          </span>
          <span className="tabular-nums">{unit ? compactMoney(d.value) : d.value.toLocaleString('en-US')}</span>
        </li>
      ))}
    </ul>
  )
}
const compactMoney = (v: number) => (v >= 10000 ? compact(v) : v.toLocaleString('en-US', { maximumFractionDigits: 0 }))

export function ChartCard({ title, description, children, className, action }: { title: string; description?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1"><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function Kpi({ label, value, hint, tone, to }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'warn' | 'bad'; to?: string }) {
  const body = (
    <Card className={cn('h-full p-4 transition-colors', to && 'hover:border-primary/40')}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', tone === 'bad' && 'text-destructive', tone === 'warn' && 'text-amber-700 dark:text-amber-400')}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  )
  return to ? <a href={`#${to}`} className="block">{body}</a> : body
}
