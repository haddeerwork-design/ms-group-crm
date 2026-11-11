import { T } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { Download, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { FX_EDITORS } from '@/lib/roles'
import { CURRENCIES } from '@/lib/pricing'
import { FX_API_SOURCE, fetchLiveRates, type LiveRates } from '@/lib/fx'
import { fetchLatestRates, fetchRateHistory, type SavedRate } from '@/lib/prices'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { StaleBadge } from './StaleBadge'

type Live = LiveRates

export function ExchangeRates({ onChanged }: { onChanged?: () => void }) {
  const { hasRole, session } = useAuth()
  const canEdit = hasRole(...FX_EDITORS)
  const [latest, setLatest] = useState<SavedRate[] | null>(null)
  const [history, setHistory] = useState<SavedRate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [manual, setManual] = useState({ base: 'USD', quote: 'EGP', rate: '', at: new Date().toISOString().slice(0, 16), notes: '' })

  const load = () => Promise.all([fetchLatestRates(), fetchRateHistory()])
    .then(([l, h]) => { setLatest(l); setHistory(h) }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  async function fetchLive() {
    setBusy('fetch')
    try {
      setLive(await fetchLiveRates())
    } catch (e) {
      toast.error('Could not get live rates: ' + (e as Error).message + '. You can enter a rate manually.')
    } finally { setBusy(null) }
  }

  async function saveLive() {
    if (!live) return
    setBusy('save')
    const rows = Object.entries(live.rates).map(([quote, rate]) => ({
      base_currency: 'USD', quote_currency: quote, rate, source: FX_API_SOURCE, rate_at: live.at, created_by: session?.user.id,
    }))
    const { error } = await supabase.from('exchange_rates').insert(rows)
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success(`${rows.length} rates saved`); setLive(null); load(); onChanged?.()
  }

  async function saveManual(e: React.FormEvent) {
    e.preventDefault()
    const rate = Number(manual.rate)
    if (!(rate > 0)) return toast.error('Enter a rate above 0')
    if (manual.base === manual.quote) return toast.error('Choose two different currencies')
    setBusy('manual')
    const { error } = await supabase.from('exchange_rates').insert({
      base_currency: manual.base, quote_currency: manual.quote, rate, source: 'Manual entry',
      rate_at: new Date(manual.at).toISOString(), notes: manual.notes.trim() || null, created_by: session?.user.id,
    })
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success('Rate saved'); setManual({ ...manual, rate: '', notes: '' }); load(); onChanged?.()
  }

  if (error) return <ErrorState message={error} />
  if (!latest) return <Loading />

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Current rates</CardTitle>
          <CardDescription>The newest saved rate for each pair. Pricing always shows which rate and date it used.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!latest.length ? <Empty title="No exchange rates saved yet" hint={canEdit ? 'Fetch live rates or enter one manually.' : 'Ask Finance or the Sales Manager to add rates.'} /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium"><T>Pair</T></th><th className="py-2 text-end font-medium"><T>Rate</T></th><th className="py-2 ps-4 font-medium"><T>Source</T></th><th className="py-2 font-medium"><T>Age</T></th>
              </tr></thead>
              <tbody>
                {latest.sort((a, b) => (a.base_currency + a.quote_currency).localeCompare(b.base_currency + b.quote_currency)).map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 font-medium">1 {r.base_currency} = {r.quote_currency}</td>
                    <td className="py-2 text-end tabular-nums">{Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                    <td className="py-2 ps-4 text-muted-foreground">{r.source}</td>
                    <td className="py-2"><StaleBadge at={r.rate_at} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4 lg:col-span-2">
        {canEdit && (
          <Card>
            <CardHeader><CardTitle>Live rates</CardTitle><CardDescription>Free daily rates against USD. They are saved automatically once a day when Finance, the Sales Manager or the Admin opens the app. A manual rate (e.g. your bank’s) always wins if it is newer.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {!live ? (
                <Button variant="outline" onClick={fetchLive} disabled={busy === 'fetch'}>{busy === 'fetch' ? <Loader2 className="animate-spin" /> : <Download />}Fetch live rates</Button>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Published {new Date(live.at).toLocaleString()}</p>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {Object.entries(live.rates).map(([c, r]) => <li key={c} className="flex justify-between"><span>USD → {c}</span><span className="tabular-nums">{r}</span></li>)}
                  </ul>
                  <div className="flex gap-2">
                    <Button onClick={saveLive} disabled={busy === 'save'}>{busy === 'save' && <Loader2 className="animate-spin" />}Save these rates</Button>
                    <Button variant="ghost" onClick={() => setLive(null)}>Discard</Button>
                  </div>
                </>
              )}
              <p className="text-xs text-muted-foreground"><a className="underline" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer"><T>Rates By Exchange Rate API</T></a></p>
            </CardContent>
          </Card>
        )}
        {canEdit && (
          <Card>
            <CardHeader><CardTitle>Manual rate</CardTitle><CardDescription>For example, your bank’s rate.</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={saveManual} className="grid grid-cols-2 gap-3">
                <Field label="1 unit of"><Select value={manual.base} onChange={(e) => setManual({ ...manual, base: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="equals"><Select value={manual.quote} onChange={(e) => setManual({ ...manual, quote: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="Rate"><Input inputMode="decimal" value={manual.rate} onChange={(e) => setManual({ ...manual, rate: e.target.value })} /></Field>
                <Field label="Date & time"><Input type="datetime-local" value={manual.at} onChange={(e) => setManual({ ...manual, at: e.target.value })} /></Field>
                <Field label="Note (e.g. bank name)" className="col-span-2"><Input value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} /></Field>
                <div className="col-span-2"><Button type="submit" disabled={busy === 'manual'}>{busy === 'manual' ? <Loader2 className="animate-spin" /> : <Plus />}Save rate</Button></div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="lg:col-span-5">
        <CardHeader><CardTitle>History</CardTitle><CardDescription>Rates are never edited or deleted.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {!history.length ? <p className="text-sm text-muted-foreground"><T>Nothing yet.</T></p> : (
            <table className="w-full min-w-[560px] text-sm">
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-1.5 text-muted-foreground">{new Date(r.rate_at).toLocaleString()}</td>
                    <td className="py-1.5">1 {r.base_currency} = {Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 6 })} {r.quote_currency}</td>
                    <td className="py-1.5 text-muted-foreground">{r.source}{r.notes ? ` · ${r.notes}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
