import { useT } from '@/lib/i18n'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { QUOTE_WRITERS } from '@/lib/roles'
import { fetchQuotations, fmtDateDMY, STATUS_LABEL, STATUS_STYLE, type QuoteStatus } from '@/lib/quotations'
import { money } from '@/lib/prices'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { usePersistentState } from '@/lib/usePersistentState'

export function Quotations() {
  const nav = useNavigate()
  const { hasRole } = useAuth()
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchQuotations>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = usePersistentState('quotes.q', '')
  const [st, setSt] = usePersistentState('quotes.status', '')
  useEffect(() => { fetchQuotations().then(setRows).catch((e) => setError(e.message)) }, [])

  const { t } = useT()
  const list = useMemo(() => (rows ?? []).filter((r) => (!st || r.status === st) &&
    (!q.trim() || [r.number, r.customer_name, r.customer_company, r.destination].some((x) => (x ?? '').toLowerCase().includes(q.trim().toLowerCase())))), [rows, q, st])

  return (
    <>
      <PageHeader title="Quotations" summary="Quotations on the El Brancy letterhead, with full revision history."
        action={hasRole(...QUOTE_WRITERS) && <Button onClick={() => nav('/quotations/new')}><Plus />{t('New quotation')}</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-8" placeholder={t('Search number, customer or destination')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-44"><Select value={st} onChange={(e) => setSt(e.target.value)} aria-label={t('Status')}>
          <option value="">{t('All statuses')}</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
        </Select></div>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {error ? <div className="p-5"><ErrorState message={error} /></div> : !rows ? <Loading /> : !list.length ? (
            <div className="p-5"><Empty title={rows.length ? 'No quotations match' : 'No quotations yet'} hint={rows.length ? 'No quotation fits this search.' : 'Create one here, or from a saved container plan.'}
              action={rows.length ? <Button variant="outline" onClick={() => { setQ(''); setSt('') }}>{t('Clear filters')}</Button>
                : hasRole(...QUOTE_WRITERS) && <><Button onClick={() => nav('/quotations/new')}><Plus />{t('New quotation')}</Button><Button variant="outline" onClick={() => nav('/quotations/new?brand=prime_roots')}>{t('New Prime Roots quotation')}</Button></>} /></div>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">{t('Number')}</th><th className="px-3 py-3 font-medium">{t('Customer')}</th><th className="px-3 py-3 font-medium">{t('Date')}</th>
                <th className="px-3 py-3 font-medium">{t('Terms')}</th><th className="px-3 py-3 text-end font-medium">{t('Total')}</th><th className="px-3 py-3 font-medium">{t('Status')}</th>
              </tr></thead>
              <tbody>
                {list.map((r) => {
                  const totals = r.quotation_items.map((i) => i.line_total)
                  const total = totals.length && totals.every((x) => x != null) ? totals.reduce((s, x) => s + (x ?? 0), 0) : null
                  return (
                    <tr key={r.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50" onClick={() => nav(`/quotations/${r.id}`)}>
                      <td className="px-5 py-3 font-medium">{r.number}{r.version > 1 && <span className="ms-1 text-xs font-normal text-muted-foreground">{t('rev.')} {r.version}</span>}</td>
                      <td className="px-3 py-3">{r.customer_name || r.customer_company || <span className="text-muted-foreground">—</span>}{r.customer_country && <div className="text-xs text-muted-foreground">{r.customer_country}</div>}</td>
                      <td className="px-3 py-3 text-muted-foreground">{fmtDateDMY(r.issue_date)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{r.incoterm ?? '—'}{r.destination ? ` ${r.destination}` : ''}</td>
                      <td className="px-3 py-3 text-end tabular-nums">{total != null ? money(total, r.currency) : <span className="text-muted-foreground">{t('{n} items', { n: r.quotation_items.length })}</span>}</td>
                      <td className="px-3 py-3"><span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLE[r.status as QuoteStatus])}>{t(STATUS_LABEL[r.status as QuoteStatus])}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
