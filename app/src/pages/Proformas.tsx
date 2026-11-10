import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { QUOTE_WRITERS } from '@/lib/roles'
import { fetchProformas, PI_STATUS, PI_STYLE } from '@/lib/proformas'
import { fmtDateDMY } from '@/lib/quotations'
import { money } from '@/lib/prices'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { cn } from '@/lib/utils'

export function Proformas() {
  const nav = useNavigate()
  const { hasRole } = useAuth()
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchProformas>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { fetchProformas().then(setRows).catch((e) => setError(e.message)) }, [])
  return (
    <>
      <PageHeader title="Proforma Invoices" summary="Made from accepted quotations. Issued proformas are locked and every issued version is kept."
        action={hasRole(...QUOTE_WRITERS) && <Button variant="outline" onClick={() => nav('/proformas/new')}>New without quotation</Button>} />
      <Card><CardContent className="overflow-x-auto p-0">
        {error ? <div className="p-5"><ErrorState message={error} /></div> : !rows ? <Loading /> : !rows.length ? (
          <div className="p-5"><Empty title="No proforma invoices yet" hint="Open an accepted quotation and click “Create proforma”."
            action={<Button variant="outline" onClick={() => nav('/quotations')}>Go to quotations</Button>} /></div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3 font-medium">Number</th><th className="px-3 py-3 font-medium">Buyer</th><th className="px-3 py-3 font-medium">Date</th><th className="px-3 py-3 text-right font-medium">Total</th><th className="px-3 py-3 font-medium">Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50" onClick={() => nav(`/proformas/${r.id}`)}>
                  <td className="px-5 py-3 font-medium">{r.number}{r.version > 1 && <span className="ml-1 text-xs font-normal text-muted-foreground">rev. {r.version}</span>}</td>
                  <td className="px-3 py-3">{r.customer_company || r.customer_name || '—'}</td>
                  <td className="px-3 py-3 text-muted-foreground">{fmtDateDMY(r.issue_date)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(r.proforma_items.reduce((s, i) => s + Number(i.line_total), 0) + (r.other_charges ?? 0), r.currency)}</td>
                  <td className="px-3 py-3"><span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', PI_STYLE[r.status])}>{PI_STATUS[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent></Card>
    </>
  )
}
