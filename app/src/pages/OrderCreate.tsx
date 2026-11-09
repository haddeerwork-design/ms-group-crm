import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { CURRENCIES, INCOTERMS } from '@/lib/pricing'
import { fetchProforma } from '@/lib/proformas'
import { fetchQuotation, lineTons } from '@/lib/quotations'
import { fetchCompanies, type Company } from '@/lib/crm'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { ErrorState, Loading } from '@/components/ui/states'

type Draft = { label: string; order: Record<string, unknown>; items: Record<string, unknown>[] }

export function OrderCreate() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { session } = useAuth()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [manual, setManual] = useState({ company_id: '', currency: 'USD', incoterm: 'CIF' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pid = params.get('proforma'), qid = params.get('quotation')

  useEffect(() => {
    (async () => {
      try {
        if (pid) {
          const { pi } = await fetchProforma(pid)
          setDraft({ label: `proforma ${pi.number}`, order: {
            proforma_id: pi.id, quotation_id: pi.quotation_id, company_id: pi.company_id, customer_company: pi.customer_company, customer_name: pi.customer_name,
            customer_country: pi.customer_country, currency: pi.currency, incoterm: pi.incoterm, payment_terms: pi.payment_terms, other_charges: pi.other_charges ?? 0,
            shipping_method: pi.shipment_mode, port_of_loading: pi.port_of_loading, port_of_discharge: pi.port_of_discharge, destination: pi.destination,
            departure_date: pi.estimated_shipment,
          }, items: (pi.proforma_items ?? []).map((i) => ({ product_id: i.product_id, description: i.description, packing: i.packing, quantity: i.quantity, unit: i.unit, net_weight_kg: i.net_weight_kg, unit_price: i.unit_price, price_unit: i.price_unit, line_total: i.line_total, sort_order: i.sort_order })) })
        } else if (qid) {
          const { quote: q } = await fetchQuotation(qid)
          const items = (q.quotation_items ?? []).map((i, k) => { const t = lineTons(i); return t ? { product_id: i.product_id, description: i.description, packing: i.packing, quantity: +t.toFixed(3), unit: 'tons', net_weight_kg: i.net_weight_kg, unit_price: i.price_per_ton, price_unit: 'ton', line_total: Math.round(t * i.price_per_ton * 100) / 100, sort_order: k } : null }).filter(Boolean) as Record<string, unknown>[]
          setDraft({ label: `quotation ${q.number}`, order: {
            quotation_id: q.id, company_id: (q as unknown as { company_id?: string | null }).company_id ?? null, customer_company: q.customer_company, customer_name: q.customer_name,
            customer_country: q.customer_country, currency: q.currency, incoterm: q.incoterm, payment_terms: q.payment_terms, destination: q.destination,
          }, items })
          if (items.length < (q.quotation_items ?? []).length) toast.message('Lines without a quantity were left out — add them in the order.')
        } else setCompanies(await fetchCompanies())
      } catch (e) { setError((e as Error).message) }
    })()
  }, [pid, qid])

  async function create() {
    setBusy(true)
    let order = draft?.order, items = draft?.items ?? []
    if (!draft) {
      const c = companies.find((x) => x.id === manual.company_id)
      if (!c) { setBusy(false); return toast.error('Choose a company.') }
      order = { company_id: c.id, customer_company: c.name, customer_country: c.country, currency: manual.currency, incoterm: manual.incoterm, payment_terms: c.preferred_payment_terms }
      items = []
    }
    const r = await supabase.from('sales_orders').insert({ ...order, created_by: session?.user.id }).select('id, number').single()
    if (r.error) { setBusy(false); return toast.error(r.error.message) }
    if (items.length) {
      const it = await supabase.from('order_items').insert(items.map((i) => ({ ...i, order_id: r.data.id })))
      if (it.error) toast.error('Order created, but lines failed: ' + it.error.message)
    }
    if (order?.company_id) await supabase.from('activities').insert({ company_id: order.company_id, kind: 'other', summary: `Order ${r.data.number} confirmed`, created_by: session?.user.id })
    toast.success(`Order ${r.data.number} created`)
    nav(`/orders/${r.data.id}`, { replace: true })
  }

  if (error) return <ErrorState message={error} />
  if ((pid || qid) && !draft) return <Loading />
  return (
    <>
      <PageHeader title="New order" summary={draft ? `From ${draft.label}: ${draft.items.length} lines will be copied.` : 'Create an order for a company. You can add the lines next.'} />
      <Card className="max-w-xl"><CardContent className="space-y-4 pt-5">
        {draft ? (
          <p className="text-sm">Buyer: <b>{String(draft.order.customer_company ?? draft.order.customer_name ?? '—')}</b> · {String(draft.order.incoterm ?? '')} · {String(draft.order.currency)}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Company" className="sm:col-span-3"><Select value={manual.company_id} onChange={(e) => setManual({ ...manual, company_id: e.target.value })}><option value="">Choose…</option>{companies.filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Currency"><Select value={manual.currency} onChange={(e) => setManual({ ...manual, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Incoterm"><Select value={manual.incoterm} onChange={(e) => setManual({ ...manual, incoterm: e.target.value })}>{INCOTERMS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
        )}
        <div className="flex gap-2"><Button onClick={create} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Create order</Button><Button variant="ghost" onClick={() => history.back()}>Cancel</Button></div>
      </CardContent></Card>
    </>
  )
}
