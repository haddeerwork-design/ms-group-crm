import { useT } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { BookOpen, Command, LayoutDashboard, PanelLeft, Plus, Search } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Short welcome tour, shown once per person on this browser (can be replayed from Help).
const STEPS = [
  { icon: LayoutDashboard, title: 'Start with “My day”', body: 'The top of the Dashboard lists what needs you today: tasks, follow-ups, quotations waiting for an answer or about to expire, and shipments arriving.' },
  { icon: PanelLeft, title: 'The menu is in groups', body: 'Sales, Operations, Products & Prices and Admin. You only see what your role can use. Click a group title to fold it.' },
  { icon: Search, title: 'Find anything', body: 'Press / or Ctrl + K and type a company, a quotation or order number, a B/L or a product.' },
  { icon: Plus, title: 'Add things fast', body: 'The green New button (or the N key) adds a company, a deal, a task or a quotation from any page.' },
  { icon: Command, title: 'You won’t lose work', body: 'Long forms keep Save at the bottom (Ctrl + S), warn you before leaving unsaved changes, and archived items can be undone.' },
  { icon: BookOpen, title: 'Help in Arabic', body: 'Open Help at the bottom of the menu for a simple guide to every screen.' },
]
const key = (uid: string) => `ms_tour_done:${uid}`
export const replayTour = () => window.dispatchEvent(new Event('ms-tour'))

export function WelcomeTour() {
  const { session, roles } = useAuth()
  const uid = session?.user.id
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const { t } = useT()
  useEffect(() => {
    if (!uid || !roles.length) return
    try { if (!localStorage.getItem(key(uid))) setOpen(true) } catch { /* storage blocked: skip the tour */ }
    const again = () => { setI(0); setOpen(true) }
    window.addEventListener('ms-tour', again); return () => window.removeEventListener('ms-tour', again)
  }, [uid, roles.length])
  const finish = () => { try { if (uid) localStorage.setItem(key(uid), '1') } catch { /* ignore */ } setOpen(false) }
  const s = STEPS[i]; const Icon = s.icon; const last = i === STEPS.length - 1
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <span className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
          <DialogTitle>{t(s.title)}</DialogTitle>
          <DialogDescription>{i === 0 ? t('Welcome to the MS El-brancy export system. A 1-minute tour.') : t('Step {n} of {total}', { n: i + 1, total: STEPS.length })}</DialogDescription>
        </DialogHeader>
        <DialogBody><p className="text-sm leading-relaxed">{t(s.body)}</p></DialogBody>
        <DialogFooter className="items-center sm:justify-between">
          <div className="flex gap-1.5" aria-hidden="true">{STEPS.map((_, j) => <span key={j} className={cn('h-1.5 rounded-full transition-all', j === i ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30')} />)}</div>
          <div className="flex gap-2">
            {!last && <Button variant="ghost" onClick={finish}>{t('Skip')}</Button>}
            {i > 0 && <Button variant="outline" onClick={() => setI(i - 1)}>{t('Back')}</Button>}
            <Button onClick={() => (last ? finish() : setI(i + 1))} autoFocus>{t(last ? 'Start working' : 'Next')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
