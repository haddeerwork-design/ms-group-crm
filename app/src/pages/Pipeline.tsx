import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { CRM_WRITERS, CRM_ASSIGNERS } from '@/lib/roles'
import { fetchCatalog, type Product } from '@/lib/catalog'
import { fetchCompanies, fetchTeam, type Company, type TeamMember } from '@/lib/crm'
import { fetchOpportunities, fetchStages, pipelineSummary, type Opportunity, type Stage } from '@/lib/sales'
import { money } from '@/lib/prices'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ErrorState, Loading } from '@/components/ui/states'
import { OpportunityDialog } from '@/components/sales/OpportunityDialog'
import { cn } from '@/lib/utils'

export function Pipeline() {
  const { hasRole, session } = useAuth()
  const canWrite = hasRole(...CRM_WRITERS)
  const editAll = hasRole(...CRM_ASSIGNERS)
  const [d, setD] = useState<{ stages: Stage[]; opps: Opportunity[]; companies: Company[]; products: Product[]; team: TeamMember[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [owner, setOwner] = useState('')
  const [editing, setEditing] = useState<Opportunity | null>(null)
  const [open, setOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)

  const [params, setParams] = useSearchParams()
  useEffect(() => { if (params.get('new')) { setEditing(null); setOpen(true); setParams({}, { replace: true }) } }, [params, setParams])
  const load = useCallback(() => Promise.all([fetchStages(), fetchOpportunities(), fetchCompanies(), fetchCatalog(), fetchTeam()])
    .then(([stages, opps, companies, cat, team]) => setD({ stages, opps, companies, products: cat.products, team })).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const company = useMemo(() => Object.fromEntries((d?.companies ?? []).map((c) => [c.id, c])), [d])
  const ownerName = useMemo(() => Object.fromEntries((d?.team ?? []).map((t) => [t.id, t.name])), [d])
  if (error) return <ErrorState message={error} />
  if (!d) return <Loading />

  const stages = d.stages.filter((s) => !s.archived_at)
  const opps = d.opps.filter((o) => !o.archived_at && (!owner || o.owner_id === owner))
  const sum = pipelineSummary(opps, d.stages)
  const canMove = (o: Opportunity) => canWrite && (o.owner_id === session?.user.id || editAll)

  async function move(o: Opportunity, stageId: string) {
    if (o.stage_id === stageId) return
    const st = d!.stages.find((s) => s.id === stageId)!
    if (st.is_lost) { setEditing({ ...o, stage_id: stageId }); setOpen(true); return } // ask for the reason
    setD((x) => x && ({ ...x, opps: x.opps.map((y) => (y.id === o.id ? { ...y, stage_id: stageId } : y)) }))
    const { error, data } = await supabase.from('opportunities').update({ stage_id: stageId }).eq('id', o.id).select('id')
    if (error || !data?.length) { toast.error(error?.message ?? 'Not allowed.'); load(); return }
    toast.success(`Moved to ${st.name}`)
  }

  return (
    <>
      <PageHeader title="Sales Pipeline" summary="Drag a deal to another stage. Weighted value = expected revenue × probability."
        action={canWrite && <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus />New deal</Button>} />
      <div className="mb-4 flex flex-wrap items-stretch gap-3">
        {sum.totals.length ? sum.totals.map((t) => (
          <div key={t.currency} className="rounded-lg border border-border bg-card px-4 py-2.5">
            <div className="text-xs text-muted-foreground">Open pipeline · {t.currency}</div>
            <div className="text-lg font-semibold tabular-nums">{money(t.open, t.currency, 0)}</div>
            <div className="text-xs text-muted-foreground">weighted {money(t.weighted, t.currency, 0)}{t.withoutProbability ? ` · ${t.withoutProbability} without probability` : ''}</div>
          </div>
        )) : <div className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">No open deals yet</div>}
        <div className="rounded-lg border border-border bg-card px-4 py-2.5">
          <div className="text-xs text-muted-foreground">Win rate</div>
          <div className="text-lg font-semibold">{sum.winRate == null ? '—' : `${sum.winRate.toFixed(0)}%`}</div>
          <div className="text-xs text-muted-foreground">{sum.won} won · {sum.lost} lost</div>
        </div>
        {d.team.length > 1 && editAll && (
          <div className="ms-auto w-48 self-center"><Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner"><option value="">All owners</option>{d.team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        <div className="flex min-w-max gap-3">
          {stages.map((s) => {
            const items = opps.filter((o) => o.stage_id === s.id)
            const total = items.reduce((a, o) => a + (o.expected_revenue ?? 0), 0)
            const ccys = new Set(items.map((o) => <T>o.currency))
            return (
</T>              <div key={s.id}
                onDragOver={(e) => { e.preventDefault(); setOverStage(s.id) }} onDragLeave={() => setOverStage(null)}
                onDrop={(e) => { e.preventDefault(); setOverStage(null); const id = e.dataTransfer.getData('text/plain') || dragId; const o = d.opps.find((x) => x.id === id); if (o && canMove(o)) move(o, s.id) }}
                className={cn('flex w-64 shrink-0 flex-col rounded-lg border border-border bg-muted/40 transition-colors', overStage === s.id && 'border-primary bg-accent',
                  s.is_won && 'bg-emerald-50/50 dark:bg-emerald-950/20', s.is_lost && 'bg-red-50/40 dark:bg-red-950/20')}>
                <div className="border-b border-border px-3 py-2">
                  <div className="flex items-center justify-between text-sm font-semibold">{s.name}<span className="rounded-full bg-card px-2 text-xs font-medium text-muted-foreground">{items.length}</span></div>
                  <div className="text-xs text-muted-foreground tabular-nums">{items.length ? (ccys.size === 1 ? money(total, [...ccys][0], 0) : 'mixed currencies') : ' '}</div>
                </div>
                <div className="flex min-h-[120px] flex-col gap-2 p-2">
                  {items.map((o) => {
                    const c = company[o.company_id]
                    const late = o.expected_close_date && !s.is_won && !s.is_lost && o.expected_close_date < new Date().toISOString().slice(0, 10)
                    return (
                      <div key={o.id} draggable={canMove(o)} onDragStart={(e) => { e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move'; setDragId(o.id) }} onDragEnd={() => setDragId(null)}
                        onClick={() => { setEditing(o); setOpen(true) }}
                        className={cn('cursor-pointer rounded-md border border-border bg-card p-2.5 text-sm shadow-sm hover:border-primary/50', dragId === o.id && 'opacity-50', canMove(o) && 'active:cursor-grabbing')}>
                        <div className="font-medium leading-snug">{o.title}</div>
                        <Link to={`/crm/${o.company_id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-muted-foreground hover:text-primary hover:underline">{c?.name ?? '—'}</Link>
                        <div className="mt-1.5 flex items-center justify-between text-xs">
                          <span className="font-medium tabular-nums">{o.expected_revenue != null ? money(o.expected_revenue, o.currency, 0) : '—'}</span>
                          {o.probability != null && <span className="text-muted-foreground">{o.probability}%</span>}
                        </div>
                        {(o.expected_close_date || o.next_action) && (
                          <div className={cn('mt-1 flex items-center gap-1 text-[11px] text-muted-foreground', late && 'text-destructive')}>
                            <CalendarClock className="size-3" />{o.expected_close_date ?? ''}{o.next_action ? ` · ${o.next_action}` : ''}
                          </div>
                        )}
                        {o.owner_id && o.owner_id !== session?.user.id && <div className="mt-1 text-[11px] text-muted-foreground">{ownerName[o.owner_id]}</div>}
                        {s.is_lost && o.lost_reason && <div className="mt-1 text-[11px] text-red-700 dark:text-red-300">{o.lost_reason}</div>}
                        {canMove(o) && (
                          <select className="mt-2 w-full rounded border border-border bg-transparent px-1 py-0.5 text-[11px] md:hidden" value={o.stage_id}
                            onClick={(e) => e.stopPropagation()} onChange={(e) => move(o, e.target.value)} aria-label="Move to stage">
                            {stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <OpportunityDialog open={open} onOpenChange={setOpen} opp={editing} stages={d.stages} companies={d.companies} products={d.products} team={d.team} onSaved={load} />
    </>
  )
}
