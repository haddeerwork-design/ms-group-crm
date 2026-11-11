import { useT } from '@/lib/i18n'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, CheckSquare, FileText, Handshake, Plus } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { CRM_WRITERS, QUOTE_WRITERS } from '@/lib/roles'
import { Button } from '@/components/ui/button'

export function QuickAdd() {
  const nav = useNavigate()
  const { hasRole } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close)
  }, [])
  // "N" opens this menu, Esc closes it (not while typing in a field)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName) || el?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); setOpen(true) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [])
  const { t } = useT()
  const items = [
    { show: hasRole(...CRM_WRITERS), label: 'Company', icon: Building2, to: '/crm?new=1' },
    { show: hasRole(...CRM_WRITERS), label: 'Deal', icon: Handshake, to: '/pipeline?new=1' },
    { show: true, label: 'Task', icon: CheckSquare, to: '/tasks?new=1' },
    { show: hasRole(...QUOTE_WRITERS), label: 'Quotation', icon: FileText, to: '/quotations/new' },
  ].filter((i) => <T>i.show)
  return (
</T>    <div className="relative" ref={ref}>
      <Button size="sm" onClick={() => setOpen((o) => !o)} aria-label={t('Quick add')} data-tip={t('New… (N)')}><Plus /><span className="hidden sm:inline">{t('New')}</span></Button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-44 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl">
          {items.map(({ label, icon: Icon, to }) => (
            <button key={label} onClick={() => { setOpen(false); nav(to) }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"><Icon className="size-4 text-muted-foreground" />{t(label)}</button>
          ))}
        </div>
      )}
    </div>
  )
}
