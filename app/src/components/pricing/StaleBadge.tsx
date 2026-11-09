import { staleness } from '@/lib/pricing'
import { ageLabel } from '@/lib/prices'
import { cn } from '@/lib/utils'

const STYLE = {
  fresh: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  old: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  stale: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
}
export function StaleBadge({ at, className }: { at: string; className?: string }) {
  const s = staleness(at)
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', STYLE[s], className)}
      title={new Date(at).toLocaleString()}>
      {s === 'stale' ? 'Out of date · ' : ''}{ageLabel(at)}
    </span>
  )
}
