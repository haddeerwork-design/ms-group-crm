import { useLayoutEffect, useRef, useState } from 'react'
import { fmtDateDMY, fmtPrice } from '@/lib/quotations'
import type { PIItem, Proforma } from '@/lib/proformas'

export type PrintablePI = Omit<Proforma, 'proforma_items' | 'id' | 'created_by' | 'created_at' | 'updated_at' | 'issued_at' | 'notes'> & { items: PIItem[] }
type Company = { company_name: string; slogan: string | null }
const LETTERHEAD = `${import.meta.env.BASE_URL}letterhead.jpg`
const UNIT = { tons: 't', cartons: 'ctn', kg: 'kg', pieces: 'pcs' } as const

function pages<T>(rows: T[], shrink: number) {
  // first page holds buyer + shipment blocks; the last page holds totals, payment, bank and signature.
  // `shrink` grows when the rendered page is too tall (measured in the browser).
  const first = Math.max(1, 9 - shrink), firstWithEnd = 4 - shrink, next = Math.max(1, 16 - shrink), nextWithEnd = 9 - shrink
  const out: { rows: T[]; end: boolean }[] = []
  let rest = rows, isFirst = true
  for (;;) {
    const cap = isFirst ? first : next, capE = isFirst ? firstWithEnd : nextWithEnd
    if (capE >= 0 && rest.length <= capE) { out.push({ rows: rest, end: true }); break }
    if (rest.length <= cap) { out.push({ rows: rest, end: false }, { rows: [], end: true }); break }
    out.push({ rows: rest.slice(0, cap), end: false }); rest = rest.slice(cap); isFirst = false
  }
  return out
}

const MAX_CONTENT_MM = 178 // writable height of the letterhead (46 mm → ~224 mm)

export function ProformaDocument({ p, company }: { p: PrintablePI; company: Company }) {
  const [shrink, setShrink] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || shrink > 12) return
    const mm = 96 / 25.4
    const tooTall = [...el.querySelectorAll<HTMLElement>('.q-content')].some((c) => c.scrollHeight > MAX_CONTENT_MM * mm)
    if (tooTall) setShrink((x) => x + 1)
  })
  const subtotal = p.items.reduce((s, i) => s + Number(i.line_total), 0)
  const total = subtotal + (p.other_charges ?? 0)
  const pg = pages(p.items, shrink)
  const ship: [string, string | null][] = [
    ['Incoterm', p.incoterm ? `${p.incoterm}${p.destination ? ' ' + p.destination : ''}` : null], ['Port of loading', p.port_of_loading],
    ['Port of discharge', p.port_of_discharge], ['Shipment', [p.shipment_mode && p.shipment_mode.toUpperCase(), p.container_details].filter(Boolean).join(' · ') || null],
    ['Estimated shipment', p.estimated_shipment ? fmtDateDMY(p.estimated_shipment) : null],
  ]
  return (
    <div className="quote-doc" dir="ltr" lang="en" ref={ref}>
      {pg.map((page, pi) => (
        <div className="q-page" key={pi}>
          <img className="q-bg" src={LETTERHEAD} alt="" />
          <div className="q-content">
            {pi === 0 ? (
              <>
                <div className="q-date"><div>Date: {fmtDateDMY(p.issue_date)}</div><div className="q-ref">No. {p.number}{p.version > 1 ? ` (rev. ${p.version})` : ''}</div></div>
                <h1 style={{ margin: '1mm 0 4mm', fontSize: '22pt' }}>Proforma Invoice</h1>
                <div className="pi-grid">
                  <div>
                    <div className="pi-h">Buyer</div>
                    <div><b>{p.customer_company || p.customer_name || '—'}</b></div>
                    {p.customer_company && p.customer_name && <div>Attn: {p.customer_name}</div>}
                    {p.customer_address && <div>{p.customer_address}</div>}
                    {p.customer_country && <div>{p.customer_country}</div>}
                    {(p.customer_email || p.customer_phone) && <div>{[p.customer_email, p.customer_phone].filter(Boolean).join(' · ')}</div>}
                  </div>
                  <div>
                    <div className="pi-h">Shipment</div>
                    {ship.filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="pi-k">{k}:</span> {v}</div>)}
                  </div>
                </div>
              </>
            ) : <div className="q-cont">{p.number} — continued</div>}
            {page.rows.length > 0 && (
              <table className="compact">
                <colgroup><col style={{ width: '38%' }} /><col style={{ width: '15%' }} /><col style={{ width: '13%' }} /><col style={{ width: '16%' }} /><col style={{ width: '18%' }} /></colgroup>
                <thead><tr><th>Description</th><th>Packing</th><th>Quantity</th><th>Unit price</th><th>Amount</th></tr></thead>
                <tbody>
                  {page.rows.map((i, k) => (
                    <tr key={k}><td className="l">{i.description}</td><td>{i.packing}</td><td>{Number(i.quantity).toLocaleString('en-US')} {UNIT[i.unit]}</td>
                      <td>{fmtPrice(i.unit_price, p.currency)}/{i.price_unit}</td><td>{fmtPrice(i.line_total, p.currency)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {page.end && (
              <>
                <table className="pi-totals">
                  <tbody>
                    <tr><td className="l">Subtotal</td><td>{fmtPrice(subtotal, p.currency)}</td></tr>
                    {p.other_charges ? <tr><td className="l">{p.other_charges_label || 'Other charges'}</td><td>{fmtPrice(p.other_charges, p.currency)}</td></tr> : null}
                    <tr className="q-total"><td className="l">Total {p.incoterm ?? ''} ({p.currency})</td><td>{fmtPrice(total, p.currency)}</td></tr>
                  </tbody>
                </table>
                <div className="pi-blocks">
                  {p.payment_terms && <div><div className="pi-h">Payment terms</div><div className="pre">{p.payment_terms}</div></div>}
                  {p.bank_details && <div><div className="pi-h">Bank details</div><div className="pre">{p.bank_details}</div></div>}
                  {p.terms && <div className="span"><div className="pi-h">Terms</div><div className="pre">{p.terms}</div></div>}
                </div>
                <div className="q-sign"><div className="q-sign-box">Authorized signature</div><div className="q-slogan">{company.company_name}{company.slogan ? ` — ${company.slogan}` : ''}</div></div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export const PI_EXTRA_CSS = `
.pi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; font-size: 8.5pt; line-height: 1.4 }
.quote-doc .pi-grid + table { margin-top: 5mm }
.pi-h { font-size: 8.5pt; font-weight: 700; color: #176b4b; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 1mm }
.pi-k { color: #666 }
.quote-doc table.pi-totals { width: 45%; margin: 3mm 0 0 auto }
.quote-doc table.pi-totals td { padding: 1.5mm 3mm; text-align: right }
.pi-blocks { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 6mm; margin-top: 3mm; font-size: 8pt; line-height: 1.4 }
.pi-blocks + .q-sign { margin-top: 5mm }
.pi-blocks .span { grid-column: 1 / -1 }
.pi-blocks .pre { white-space: pre-wrap }
`
