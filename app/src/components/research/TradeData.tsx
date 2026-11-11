import { useEffect, useState } from 'react'
import { ArrowLeft, Globe2, Info, Loader2, Package, Search } from 'lucide-react'
import { EGYPT, FALLBACK_COUNTRIES, HS_PRODUCTS, defaultTradeYear, fetchCountries, fetchTrade, hsLabel, rank, type TradeRow } from '@/lib/trade'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/states'
import { T, TV, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`)
const tons = (kg: number) => (kg ? `${Math.round(kg / 1000).toLocaleString('en-US')} t` : '—')

type View =
  | { kind: 'importers'; cmd: string }                       // who imports this product
  | { kind: 'country'; reporter: string }                    // what this country imports (our products)
  | { kind: 'suppliers'; reporter: string; cmd: string }     // where this country buys this product
  | { kind: 'egypt'; cmd: string }                           // where Egypt sells this product

/** Official trade figures (UN Comtrade): who imports what, from where, and at what average price. */
export function TradeData({ onFindImporters }: { onFindImporters: (product: string, country: string) => void }) {
  const { t } = useT()
  const [mode, setMode] = useState<'product' | 'country'>('product')
  const [cmd, setCmd] = useState('080450')
  const [custom, setCustom] = useState('')
  const [reporter, setReporter] = useState('784')
  const [year, setYear] = useState(defaultTradeYear())
  const [countries, setCountries] = useState(FALLBACK_COUNTRIES)
  const [view, setView] = useState<View | null>(null)
  const [stack, setStack] = useState<View[]>([])
  const [rows, setRows] = useState<TradeRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState('')
  useEffect(() => { fetchCountries().then((c) => c.length && setCountries(c)).catch(() => { /* keep the short list */ }) }, [])
  const cname = (code: string) => countries.find((c) => c.code === code)?.name ?? code

  async function open(v: View, push = true) {
    setBusy(true); setError(null)
    try {
      const q = v.kind === 'importers' ? { flow: 'M' as const, cmd: v.cmd, year }
        : v.kind === 'country' ? { flow: 'M' as const, reporter: v.reporter, partner: '0', cmd: HS_PRODUCTS.map((x) => x.code).join(','), year }
        : v.kind === 'suppliers' ? { flow: 'M' as const, reporter: v.reporter, cmd: v.cmd, year }
        : { flow: 'X' as const, reporter: EGYPT, cmd: v.cmd, year }
      // ask for at most 20 products per call (the free Comtrade service limit), then join the answers
      const codes = q.cmd.split(',')
      const parts = await Promise.all(Array.from({ length: Math.ceil(codes.length / 20) }, (_, i) => fetchTrade({ ...q, cmd: codes.slice(i * 20, i * 20 + 20).join(',') })))
      const r = { rows: parts.flatMap((x) => x.rows), source: parts[0]?.source ?? '' }
      if (push && view) setStack((s) => [...s, view])
      setView(v); setRows(r.rows); setSource(r.source)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const back = () => { const prev = stack[stack.length - 1]; if (!prev) return; setStack((s) => s.slice(0, -1)); open(prev, false) }
  const start = () => { setStack([]); open(mode === 'product' ? { kind: 'importers', cmd: custom.trim() || cmd } : { kind: 'country', reporter }, false) }

  const years = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 1 - i)
  const by = view?.kind === 'importers' ? 'reporter' : view?.kind === 'country' ? 'cmd' : 'partner'
  const r = rows ? rank(rows, by as 'reporter' | 'cmd' | 'partner') : null
  const max = r?.rows[0]?.value || 1
  const title = !view ? '' : view.kind === 'importers' ? t('Who imports {p}', { p: t(hsLabel(view.cmd)) })
    : view.kind === 'country' ? t('What {c} imports (our products)', { c: cname(view.reporter) })
    : view.kind === 'suppliers' ? t('Where {c} buys {p}', { c: cname(view.reporter), p: t(hsLabel(view.cmd)) })
    : t('Where Egypt sells {p}', { p: t(hsLabel(view.cmd)) })
  const egyptRow = view?.kind === 'suppliers' ? r?.all.find((x) => String(x.code) === EGYPT) : undefined
  const egyptRank = egyptRow ? egyptRow.rank : null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Official trade figures</CardTitle>
          <CardDescription>From the United Nations trade database (UN Comtrade): imports by country and product, in US dollars and tons. Country totals only, no company names — use “Find importers” for companies.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-end">
          <div className="flex rounded-lg border border-border p-0.5">
            <Button size="sm" variant={mode === 'product' ? 'outline' : 'ghost'} onClick={() => setMode('product')}><Package />By product</Button>
            <Button size="sm" variant={mode === 'country' ? 'outline' : 'ghost'} onClick={() => setMode('country')}><Globe2 />By country</Button>
          </div>
          {mode === 'product' ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
              <Field label="Product">
                <Select value={cmd} onChange={(e) => { setCmd(e.target.value); setCustom('') }}>
                  {HS_PRODUCTS.map((x) => <option key={x.code} value={x.code}>{x.label} — {x.code}</option>)}
                </Select>
              </Field>
              <Field label="or HS code"><Input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="e.g. 0804" /></Field>
            </div>
          ) : (
            <Field label="Country">
              <Select value={reporter} onChange={(e) => setReporter(e.target.value)}>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Year">
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select>
          </Field>
          <Button onClick={start} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Search />}Show</Button>
        </CardContent>
      </Card>

      {error && <ErrorState message={error} />}

      {view && r && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              <CardDescription>
                {year} · <TV k="{n} countries" v={{ n: r.count }} /> · <T>Total</T> {usd(r.total)}
                {view.kind === 'suppliers' && <> · {egyptRank ? <TV k="Egypt is #{n} ({s}%)" v={{ n: egyptRank, s: egyptRow!.share.toFixed(1) }} /> : <T>Egypt is not among the suppliers</T>}</>}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {stack.length > 0 && <Button size="sm" variant="outline" onClick={back} disabled={busy}><ArrowLeft className="rtl:-scale-x-100" />Back</Button>}
              {(view.kind === 'importers' || view.kind === 'suppliers') && <Button size="sm" variant="outline" onClick={() => open({ kind: 'egypt', cmd: view.cmd })} disabled={busy}>Where Egypt sells it</Button>}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!r.rows.length ? <p className="px-5 pb-5 text-sm text-muted-foreground"><T>No figures for this choice and year. Try an earlier year — some countries report late.</T></p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="border-y border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-10 px-5 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium"><T>{by === 'cmd' ? 'Product' : by === 'reporter' ? 'Importing country' : view.kind === 'egypt' ? 'Buying country' : 'Supplier country'}</T></th>
                    <th className="px-3 py-2.5 text-end font-medium"><T>Value (USD)</T></th>
                    <th className="w-40 px-3 py-2.5 font-medium"><T>Share</T></th>
                    <th className="px-3 py-2.5 text-end font-medium"><T>Quantity</T></th>
                    <th className="px-3 py-2.5 text-end font-medium"><T>Avg. price / kg</T></th>
                    <th className="px-3 py-2.5" />
                  </tr></thead>
                  <tbody>
                    {r.rows.map((x) => {
                      const isEgypt = String(x.code) === EGYPT && by !== 'cmd'
                      return (
                        <tr key={x.key} className={cn('border-b border-border last:border-0', isEgypt && 'bg-emerald-50/70 dark:bg-emerald-950/40')}>
                          <td className="px-5 py-2.5 text-muted-foreground tabular-nums">{x.rank}</td>
                          <td className="px-3 py-2.5 font-medium">{by === 'cmd' ? <><T>{hsLabel(String(x.code))}</T><div className="text-xs font-normal text-muted-foreground">HS {x.code}</div></> : x.label}</td>
                          <td className="px-3 py-2.5 text-end tabular-nums">{usd(x.value)}</td>
                          <td className="px-3 py-2.5"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${(x.value / max) * 100}%` }} /></div><span className="w-10 text-end text-[11px] tabular-nums text-muted-foreground">{x.share.toFixed(1)}%</span></div></td>
                          <td className="px-3 py-2.5 text-end tabular-nums text-muted-foreground">{tons(x.kg)}</td>
                          <td className="px-3 py-2.5 text-end tabular-nums text-muted-foreground">{x.perKg ? `$${x.perKg.toFixed(2)}` : '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-end">
                            {view.kind === 'importers' && <Button size="sm" variant="ghost" onClick={() => open({ kind: 'suppliers', reporter: String(x.code), cmd: view.cmd })} disabled={busy}><T>Suppliers</T></Button>}
                            {view.kind === 'country' && <Button size="sm" variant="ghost" onClick={() => open({ kind: 'suppliers', reporter: view.reporter, cmd: String(x.code) })} disabled={busy}><T>Suppliers</T></Button>}
                            {(view.kind === 'importers' || view.kind === 'egypt') && <Button size="sm" variant="ghost" onClick={() => onFindImporters(hsLabel(view.cmd).replace(/\s*\(.*\)$/, ''), x.label)}><T>Find importers</T></Button>}
                            {view.kind === 'country' && <Button size="sm" variant="ghost" onClick={() => onFindImporters(hsLabel(String(x.code)).replace(/\s*\(.*\)$/, ''), cname(view.reporter))}><T>Find importers</T></Button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="flex items-start gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span><T>Source</T>: {source || 'UN Comtrade'} · <T>Values as each country reported them to the UN (imports usually include freight and insurance). Average price = value ÷ net weight.</T></span>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
