import { cn } from '@/lib/utils'
export function Badge({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center rounded-full border border-border bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground', className)} {...p} />
}
