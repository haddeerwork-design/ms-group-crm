import { useT } from '@/lib/i18n'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CheckCircle2, CheckSquare, ChevronDown, Clock, PhoneCall, Ship } from 'lucide-react'
import { AWAIT_DAYS, myDay, type AnalyticsData } from '@/lib/analytics'
import { Panel } from './dash'
import { cn } from '@/lib/utils'

const ago = (iso: string, today: string) => Math.round((Date.parse(today) - Date.parse(iso.slice(0, 10))) / 86400000)

/** Personal to-do for today, built from what is already in the system. */
export function MyDay({ data, userId, today, name }: { data: AnalyticsData; userId: string; today: string; name?: string | null }) {
  const r = myDay(data, userId, today)
  const { t, lang } = useT()
  const dm = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' })
  const [open, setOpen] = useState(true)
  const groups = [
    { key: 'tasks', icon: CheckSquare, title: t('Tasks due'), to: '/tasks', items: r.tasks.map((x) => ({ id: x.id, to: '/tasks', label: x.title, meta: x.due_date! < today ? `${t('overdue')} · ${dm(x.due_date!)}` : t('today'), late: x.due_date! < today })) },
    { key: 'follow', icon: PhoneCall, title: t('Follow-ups'), to: '/crm', items: r.followUps.map((c) => ({ id: c.id, to: `/crm/${c.id}`, label: c.name, meta: c.next_follow_up_date! < today ? `${t('overdue')} · ${dm(c.next_follow_up_date!)}` : t('today'), late: c.next_follow_up_date! < today })) },
    { key: 'await', icon: Clock, title: t('No answer for {n}+ days', { n: AWAIT_DAYS }), to: '/quotations', items: r.awaiting.map((q) => ({ id: q.id, to: `/quotations/${q.id}`, label: `${q.number}${q.customer_company ? ` · ${q.customer_company}` : ''}`, meta: t('sent {n} days ago', { n: ago(q.sent_at!, today) }), late: false })) },
    { key: 'exp', icon: CalendarClock, title: t('Quotations expiring'), to: '/quotations', items: r.expiring.map((q) => ({ id: q.id, to: `/quotations/${q.id}`, label: `${q.number}${q.customer_company ? ` · ${q.customer_company}` : ''}`, meta: q.valid_until === today ? t('expires today') : t('until {date}', { date: dm(q.valid_until!) }), late: q.valid_until === today })) },
    { key: 'arr', icon: Ship, title: t('Arriving this week'), to: '/orders', items: r.arriving.map((o) => ({ id: o.id, to: `/orders/${o.id}`, label: `${o.number}${o.customer_company ? ` · ${o.customer_company}` : ''}`, meta: `ETA ${dm(o.eta!)}`, late: false })) },
  ].filter((g) => <T>g.items.length)

  return (
</T>    <Panel className="mb-4"
      title={<span>{t('My day')}{name ? `${t(', ')}${name.split(' ')[0]}` : ''}</span>}
      sub={r.total ? (r.total > 1 ? t('{n} things need you today', { n: r.total }) : t('1 thing needs you today')) : t('Nothing waiting for you today')}
      action={r.total > 0 && <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">{t(open ? 'Hide' : 'Show')}<ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90 rtl:rotate-90')} /></button>}>
      {!r.total ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-emerald-600" />{t('All clear. No tasks, follow-ups or quotations need you right now.')}</p>
      ) : open && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {groups.map(({ key, icon: Icon, title, to, items }) => (
            <div key={key} className="min-w-0">
              <Link to={to} className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                <Icon className="size-3.5" />{title}<span className="ms-auto rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-foreground">{items.length}</span>
              </Link>
              <ul className="space-y-1">
                {items.slice(0, 4).map((i) => (
                  <li key={i.id}>
                    <Link to={i.to} className="block rounded-md px-2 py-1.5 hover:bg-accent">
                      <div className="truncate text-sm font-medium">{i.label}</div>
                      <div className={cn('text-xs', i.late ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>{i.meta}</div>
                    </Link>
                  </li>
                ))}
                {items.length > 4 && <li><Link to={to} className="px-2 text-xs font-medium text-primary hover:underline">{t('+{n} more', { n: items.length - 4 })}</Link></li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
