import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { todayISO } from '@/lib/crm'
import { liveReminders, type Notification, type Reminder } from '@/lib/sales'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function NotificationBell() {
  const { session } = useAuth()
  const nav = useNavigate()
  const me = session?.user.id ?? ''
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!me) return
    const [n, t, c, q] = await Promise.all([
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('tasks').select('id, title, status, due_date, assignee_id, reminder_at').eq('assignee_id', me).in('status', ['open', 'in_progress']),
      supabase.from('companies').select('id, name, next_follow_up_date, owner_id, archived_at').eq('owner_id', me).lte('next_follow_up_date', todayISO()),
      supabase.from('quotations').select('id, number, status, valid_until, created_by').eq('created_by', me).eq('status', 'sent'),
    ])
    setItems(n.error ? [] : (n.data as Notification[]))
    const r = liveReminders({ me, today: todayISO(), tasks: t.data ?? [], companies: c.data ?? [], quotations: q.data ?? [] })
    for (const x of t.data ?? []) if (x.reminder_at && new Date(x.reminder_at) <= new Date()) r.unshift({ key: 'r' + x.id, tone: 'amber', title: 'Reminder', body: x.title, link: '/tasks' })
    setReminders(r)
  }, [me])

  useEffect(() => { load(); const i = setInterval(load, 120000); return () => clearInterval(i) }, [load])
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close)
  }, [])

  const unread = items.filter((i) => !i.read_at).length
  const badge = unread + reminders.length

  async function go(link: string | null, id?: string) {
    if (id) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    setOpen(false); if (link) nav(link); load()
  }
  async function markAll() {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    load()
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" aria-label={`Notifications (${badge})`} data-tip="Notifications" onClick={() => { setOpen((o) => !o); if (!open) load() }}>
        <Bell />
        {badge > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">{badge > 99 ? '99+' : badge}</span>}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && <button className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={markAll}><CheckCheck className="size-3.5" />Mark all read</button>}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {reminders.length > 0 && (
              <div className="border-b border-border py-1">
                <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Needs attention</div>
                {reminders.map((r) => (
                  <button key={r.key} onClick={() => go(r.link)} className="flex w-full gap-2 px-3 py-2 text-left hover:bg-accent">
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', r.tone === 'red' ? 'bg-destructive' : 'bg-amber-400')} />
                    <span><span className="block text-sm font-medium">{r.title}</span><span className="block text-xs text-muted-foreground">{r.body}</span></span>
                  </button>
                ))}
              </div>
            )}
            {!items.length && !reminders.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">You’re all caught up.</p>}
            {items.map((n) => (
              <button key={n.id} onClick={() => go(n.link, n.id)} className={cn('flex w-full gap-2 px-3 py-2 text-left hover:bg-accent', !n.read_at && 'bg-accent/50')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{n.title}</span>
                  {n.body && <span className="block text-xs text-muted-foreground">{n.body}</span>}
                  <span className="block text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
