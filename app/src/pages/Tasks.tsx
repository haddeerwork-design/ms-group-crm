import { useT } from '@/lib/i18n'
import { T } from '@/lib/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { CRM_ASSIGNERS } from '@/lib/roles'
import { fetchCompanies, fetchTeam, todayISO, type Company, type TeamMember } from '@/lib/crm'
import { fetchOpportunities, fetchTasks, taskBucket, type Bucket, type Opportunity, type Task } from '@/lib/sales'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { TaskDialog } from '@/components/sales/TaskDialog'
import { cn } from '@/lib/utils'
import { usePersistentState } from '@/lib/usePersistentState'

const TABS: { k: Bucket | 'all_open'; label: string }[] = [
  { k: 'today', label: 'Today' }, { k: 'overdue', label: 'Overdue' }, { k: 'upcoming', label: 'Upcoming' },
  { k: 'no_date', label: 'No date' }, { k: 'all_open', label: 'All open' }, { k: 'done', label: 'Completed' },
]
const PRI = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-zinc-300 dark:bg-zinc-600' }

export function Tasks() {
  const { t: tl } = useT()
  const { hasRole, session } = useAuth()
  const isManager = hasRole(...CRM_ASSIGNERS)
  const [d, setD] = useState<{ tasks: Task[]; companies: Company[]; opps: Opportunity[]; team: TeamMember[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Bucket | 'all_open'>('today')
  const [view, setView] = usePersistentState<'list' | 'calendar'>('tasks.view', 'list')
  const [who, setWho] = usePersistentState('tasks.who', 'me')
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [editing, setEditing] = useState<Task | null>(null)
  const [open, setOpen] = useState(false)
  const [newDate, setNewDate] = useState<string | undefined>()

  const [params, setParams] = useSearchParams()
  useEffect(() => { if (params.get('new')) { setEditing(null); setNewDate(undefined); setOpen(true); setParams({}, { replace: true }) } }, [params, setParams])
  const load = useCallback(() => Promise.all([fetchTasks(), fetchCompanies().catch(() => [] as Company[]), fetchOpportunities().catch(() => [] as Opportunity[]), fetchTeam().catch(() => [] as TeamMember[])])
    .then(([tasks, companies, opps, team]) => setD({ tasks, companies, opps, team })).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const today = todayISO()
  const company = useMemo(() => Object.fromEntries((d?.companies ?? []).map((c) => [c.id, c.name])), [d])
  const ownerName = useMemo(() => Object.fromEntries((d?.team ?? []).map((t) => [t.id, t.name])), [d])
  if (error) return <ErrorState message={error} />
  if (!d) return <Loading />

  const mine = d.tasks.filter((t) => who === 'all' || (who === 'me' ? t.assignee_id === session?.user.id : who === 'given' ? t.created_by === session?.user.id && t.assignee_id !== session?.user.id : t.assignee_id === who))
  const count = (b: Bucket | 'all_open') => mine.filter((t) => (b === 'all_open' ? taskBucket(t, today) !== 'done' : taskBucket(t, today) === b)).length
  const list = mine.filter((t) => (tab === 'all_open' ? taskBucket(t, today) !== 'done' : taskBucket(t, today) === tab))

  async function toggle(t: Task) {
    const { error, data } = await supabase.from('tasks').update({ status: t.status === 'done' ? 'open' : 'done' }).eq('id', t.id).select('id')
    if (error || !data?.length) return toast.error(error?.message ?? 'Not allowed.')
    load()
  }
  const openNew = (date?: string) => { setEditing(null); setNewDate(date); setOpen(true) }

  return (
    <>
      <PageHeader title="Tasks & Follow-ups" summary={tl('{n} due today · {m} overdue', { n: count('today'), m: count('overdue') })}
        action={<Button onClick={() => openNew()}><Plus />New task</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          <Button variant={view === 'list' ? 'outline' : 'ghost'} size="sm" onClick={() => setView('list')}><List />List</Button>
          <Button variant={view === 'calendar' ? 'outline' : 'ghost'} size="sm" onClick={() => setView('calendar')}><CalendarDays />Calendar</Button>
        </div>
        <div className="w-48"><Select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose tasks">
          <option value="me">My tasks</option><option value="given">Tasks I gave others</option>
          {isManager && <><option value="all">Everyone</option>{d.team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</>}
        </Select></div>
      </div>

      {view === 'list' ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1 border-b border-border">
            {TABS.map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t.k ? 'border-primary' : 'border-transparent text-muted-foreground hover:text-foreground', t.k === 'overdue' && count('overdue') > 0 && 'text-destructive')}>
                {t.label} <span className="text-xs text-muted-foreground">{count(t.k)}</span>
              </button>
            ))}
          </div>
          <Card><CardContent className="p-0">
            {!list.length ? <div className="p-5"><Empty title="Nothing here" hint={tab === 'today' ? 'No tasks due today.' : undefined} action={<Button variant="outline" onClick={() => openNew()}><Plus />New task</Button>} /></div> : (
              <ul className="divide-y divide-border">
                {list.map((t) => {
                  const b = taskBucket(t, today)
                  return (
                    <li key={t.id} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/40">
                      <input type="checkbox" className="mt-1 size-4 accent-[#23856B]" checked={t.status === 'done'} onChange={() => toggle(t)} aria-label={`Done: ${t.title}`} />
                      <button className="min-w-0 flex-1 text-start" onClick={() => { setEditing(t); setOpen(true) }}>
                        <div className={cn('flex items-center gap-2 text-sm font-medium', t.status === 'done' && 'text-muted-foreground line-through')}>
                          <span className={cn('size-2 shrink-0 rounded-full', PRI[t.priority])} title={`${t.priority} priority`} />{t.title}
                          {t.status === 'in_progress' && <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-800 dark:bg-sky-950 dark:text-sky-200"><T>in progress</T></span>}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          <span className={cn(b === 'overdue' && 'font-medium text-destructive')}>{t.due_date ?? 'No date'}</span>
                          {t.company_id && company[t.company_id] && <> · <Link to={`/crm/${t.company_id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{company[t.company_id]}</Link></>}
                          {t.assignee_id !== session?.user.id && <> · for {ownerName[t.assignee_id] ?? 'colleague'}</>}
                          {t.created_by !== session?.user.id && t.assignee_id === session?.user.id && <> · from {ownerName[t.created_by] ?? 'manager'}</>}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent></Card>
        </>
      ) : (
        <MonthCalendar month={month} setMonth={setMonth} tasks={mine.filter((t) => t.due_date)} today={today}
          onOpen={(t) => { setEditing(t); setOpen(true) }} onNew={(date) => openNew(date)} />
      )}
      <TaskDialog open={open} onOpenChange={setOpen} task={editing} companies={d.companies} opportunities={d.opps} team={d.team} defaults={newDate ? { due_date: newDate } : undefined} onSaved={load} />
    </>
  )
}

function MonthCalendar({ month, setMonth, tasks, today, onOpen, onNew }: { month: string; setMonth: (m: string) => void; tasks: Task[]; today: string; onOpen: (t: Task) => void; onNew: (d: string) => void }) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const startDow = (first.getUTCDay() + 1) % 7 // week starts Saturday (Egypt)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = Array.from({ length: Math.ceil((startDow + days) / 7) * 7 }, (_, i) => i - startDow + 1)
  const shift = (k: number) => { const d = new Date(Date.UTC(y, m - 1 + k, 1)); setMonth(d.toISOString().slice(0, 7)) }
  return (
    <Card><CardContent className="pt-4">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></Button>
        <div className="font-semibold">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
        <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
        {['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => <div key={d} className="bg-muted px-2 py-1.5 font-medium text-muted-foreground">{d}</div>)}
        {cells.map((day, i) => {
          const iso = day >= 1 && day <= days ? `${month}-${String(day).padStart(2, '0')}` : null
          const items = iso ? tasks.filter((t) => t.due_date === iso) : []
          return (
            <div key={i} className={cn('min-h-[88px] bg-card p-1.5', !iso && 'bg-muted/40')} onDoubleClick={() => iso && onNew(iso)}>
              {iso && <div className={cn('mb-1 text-end text-[11px]', iso === today && 'font-bold text-primary')}>{day}</div>}
              {items.slice(0, 3).map((t) => (
                <button key={t.id} onClick={() => onOpen(t)} className={cn('mb-0.5 block w-full truncate rounded px-1 py-0.5 text-start text-[11px]',
                  t.status === 'done' ? 'bg-muted text-muted-foreground line-through' : iso! < today ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' : 'bg-accent text-accent-foreground')}>{t.title}</button>
              ))}
              {items.length > 3 && <div className="text-[10px] text-muted-foreground">+{items.length - 3} more</div>}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground"><T>Double-click a day to add a task.</T></p>
    </CardContent></Card>
  )
}
