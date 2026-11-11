import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ExternalLink, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { T, useT } from '@/lib/i18n'
import { ACTION_VERB, AREAS, diff, fetchActivity, PAGE, recordLabel, recordLink, type AuditRow } from '@/lib/activity'
import { usePersistentState } from '@/lib/usePersistentState'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { cn } from '@/lib/utils'

const PERIODS: Record<string, number> = { '7': 7, '30': 30, '90': 90, all: 0 }
const TONE = {
  INSERT: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  UPDATE: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  DELETE: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200',
}
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA')

export function Activity() {
  const { t, lang } = useT()
  const [area, setArea] = usePersistentState('ms_act_area', '')
  const [actor, setActor] = usePersistentState('ms_act_actor', '')
  const [action, setAction] = usePersistentState('ms_act_action', '')
  const [period, setPeriod] = usePersistentState('ms_act_period', '30')
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [people, setPeople] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Record<number, boolean>>({})

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, email').then(({ data }) =>
      setPeople(Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name || p.email || '—']))))
  }, [])

  const since = useMemo(() => {
    const d = PERIODS[period]; if (!d) return undefined
    const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString()
  }, [period])
  useEffect(() => {
    setRows(null); setError(null)
    fetchActivity({ area, actor, action, since }).then((r) => { setRows(r); setMore(r.length === PAGE) }).catch((e) => setError(e.message))
  }, [area, actor, action, since])

  async function loadMore() {
    if (!rows?.length) return
    setBusy(true)
    try { const r = await fetchActivity({ area, actor, action, since, before: rows[rows.length - 1].id }); setRows([...rows, ...r]); setMore(r.length === PAGE) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const filtered = !!(area || actor || action || period !== '30')

  return (
    <>
      <PageHeader title="Activity log" summary="Who changed what, and when: prices, quotations, proformas, orders, payments, roles and settings. Only the Super Admin sees this page." />
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Select aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">All areas</option>
          {Object.entries(AREAS).sort((a, b) => a[1].localeCompare(b[1])).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select aria-label="Person" value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">Everyone</option>
          {Object.entries(people).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </Select>
        <Select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Added, changed and deleted</option>
          <option value="INSERT">Added</option><option value="UPDATE">Changed</option><option value="DELETE">Deleted</option>
        </Select>
        <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
        </Select>
      </div>

      {error ? <ErrorState message={error} /> : !rows ? <Loading /> : !rows.length ? (
        <Empty title="Nothing changed in this period" hint={filtered ? 'Try another filter or a longer period.' : undefined}
          action={filtered ? <Button variant="outline" onClick={() => { setArea(''); setActor(''); setAction(''); setPeriod('30') }}>Clear filters</Button> : undefined} />
      ) : (
        <Card><CardContent className="p-0">
          <ol>
            {rows.map((r, i) => {
              const newDay = i === 0 || dayKey(rows[i - 1].at) !== dayKey(r.at)
              const changes = diff(r)
              const link = recordLink(r)
              const label = recordLabel(r)
              const isOpen = !!open[r.id]
              return (
                <li key={r.id}>
                  {newDay && <div className="sticky top-14 z-10 border-b border-border bg-muted/80 px-5 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">{fmtDay(r.at)}</div>}
                  <div className="border-b border-border last:border-0">
                    <button type="button" onClick={() => setOpen({ ...open, [r.id]: !isOpen })} aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-5 py-3 text-start text-sm hover:bg-accent/50">
                      <span className="w-12 shrink-0 tabular-nums text-xs text-muted-foreground">{fmtTime(r.at)}</span>
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium', TONE[r.action])}><T>{ACTION_VERB[r.action]}</T></span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-muted-foreground"><T>{AREAS[r.table_name] ?? r.table_name}</T></span>{label && <span className="font-medium"> · {label}</span>}
                      </span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{r.actor ? people[r.actor] ?? t('Unknown user') : t('System')}</span>
                      <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                    </button>
                    {isOpen && (
                      <div className="space-y-2 bg-muted/30 px-5 pb-4 pt-1 text-sm">
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="sm:hidden">{r.actor ? people[r.actor] ?? t('Unknown user') : t('System')}</span>
                          {link && <Link to={link} className="inline-flex items-center gap-1 text-primary hover:underline"><T>Open</T><ExternalLink className="size-3" /></Link>}
                        </div>
                        {!changes.length ? <p className="text-xs text-muted-foreground"><T>No visible fields changed.</T></p> : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] text-xs">
                              <thead><tr className="text-start text-muted-foreground">
                                <th className="py-1 pe-3 text-start font-medium"><T>Field</T></th>
                                {r.action !== 'INSERT' && <th className="py-1 pe-3 text-start font-medium"><T>Before</T></th>}
                                {r.action !== 'DELETE' && <th className="py-1 text-start font-medium"><T>After</T></th>}
                              </tr></thead>
                              <tbody>
                                {changes.map((c) => (
                                  <tr key={c.field} className="border-t border-border/60 align-top">
                                    <td className="py-1.5 pe-3 font-medium">{c.field}</td>
                                    {r.action !== 'INSERT' && <td className={cn('max-w-[280px] break-words py-1.5 pe-3', r.action === 'UPDATE' && 'text-rose-700 line-through decoration-rose-300 dark:text-rose-300')}>{c.before}</td>}
                                    {r.action !== 'DELETE' && <td className={cn('max-w-[280px] break-words py-1.5', r.action === 'UPDATE' && 'text-emerald-700 dark:text-emerald-300')}>{c.after}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          {more && <div className="border-t border-border p-3 text-center"><Button variant="outline" onClick={loadMore} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Show older</Button></div>}
        </CardContent></Card>
      )}
    </>
  )
}
