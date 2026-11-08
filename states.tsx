import { AlertTriangle, Loader2 } from 'lucide-react'
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{label}</div>
}
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{message}</span>
    </div>
  )
}
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return <div className="rounded-md border border-dashed border-border p-8 text-center"><p className="text-sm font-medium">{title}</p>{hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}</div>
}
