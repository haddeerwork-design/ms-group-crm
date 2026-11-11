import { useT } from '@/lib/i18n'
import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * On phones the filter controls hide behind one "Filters" button (with the number in use);
 * on larger screens they show inline exactly as before.
 */
export function MobileFilters({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const { t } = useT()
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={cn('inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium md:hidden', active > 0 && 'border-primary/50 text-primary')}>
        <SlidersHorizontal className="size-4" />{t('Filters')}{active > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{active}</span>}
      </button>
      <div className={cn('w-full flex-wrap items-center gap-2 md:contents', open ? 'flex' : 'hidden')}>{children}</div>
    </>
  )
}
