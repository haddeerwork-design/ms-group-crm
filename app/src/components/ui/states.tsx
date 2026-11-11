import { useT } from '@/lib/i18n'
import { AlertTriangle, Loader2 } from 'lucide-react'
/** Grey placeholder rows in the shape of a list, so the page feels ready while data arrives. */
export function Loading({ label = 'Loading…', rows = 5 }: { label?: string; rows?: number }) {
  const { t } = useT()
  return (
    <div className="p-5" role="status" aria-live="polite">
      <span className="sr-only">{t(label)}</span>
      <div className="animate-pulse space-y-4" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-3.5 rounded bg-muted" style={{ width: `${[28, 22, 32, 18, 26][i % 5]}%` }} />
            <div className="h-3.5 flex-1 rounded bg-muted/70" />
            <div className="hidden h-3.5 w-24 rounded bg-muted/70 sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
/** Small inline spinner for buttons and short waits. */
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{label}</span>
}
export function ErrorState({ message }: { message: string }) {
  const { t } = useT()
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{t(message)}</span>
    </div>
  )
}
/** Empty state: says what is missing and offers the next step (action). */
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  const { t } = useT()
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center">
      <p className="text-sm font-medium">{t(title)}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t(hint)}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
