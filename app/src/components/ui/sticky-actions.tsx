import { cn } from '@/lib/utils'

/** Bar that stays at the bottom of the screen on long forms: status on the left, actions on the right. */
export function StickyActions({ dirty, children, info, className }: { dirty?: boolean; info?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('sticky bottom-0 z-20 -mx-4 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur md:-mx-8 md:px-8', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {dirty !== undefined && (
          <span className={cn('inline-flex items-center gap-1.5', dirty ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')} role="status">
            <span className={cn('size-2 rounded-full', dirty ? 'bg-amber-500' : 'bg-emerald-500')} />
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
        )}
        {info}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
