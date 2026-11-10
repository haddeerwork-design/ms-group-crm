import { BRANDS, fmtDateDMY, fmtPrice, lineTons, unitsLabel, type Brand, type QuoteItem } from '@/lib/quotations'

/** Data needed to print. Works for the live quotation and for saved versions. */
export type PrintableQuote = {
  number: string; version: number; issue_date: string; valid_until: string | null; currency: string
  incoterm: string | null; destination: string | null; payment_terms: string | null
  customer_name: string | null; customer_company: string | null; customer_country: string | null
  policy_lines: string[]; show_quantities: boolean; items: QuoteItem[]
  brand?: Brand | null
}
type Company = { company_name: string; slogan: string | null }

export const letterheadUrl = (b?: Brand | null) => `${import.meta.env.BASE_URL}${BRANDS[b ?? 'ms_elbrancy'].letterhead}`

function paginate<T>(rows: T[], firstExtra: number) {
  // Capacities measured on the letterhead's writable area (46 mm → ~226 mm).
  const compact = rows.length > 4
  // Measured on rendered PDFs: compact row ≈ 9.3 mm, policy + signature ≈ 47 mm.
  const firstCap = (compact ? 11 : 8) - firstExtra, firstCapPolicy = (compact ? 6 : 4) - firstExtra
  const nextCap = 16, nextCapPolicy = 10
  const pages: { rows: T[]; policy: boolean }[] = []
  let rest = rows, first = true
  for (;;) {
    const cap = first ? firstCap : nextCap, capP = first ? firstCapPolicy : nextCapPolicy
    if (rest.length <= capP) { pages.push({ rows: rest, policy: true }); break }
    if (rest.length <= cap) { pages.push({ rows: rest, policy: false }, { rows: [], policy: true }); break }
    pages.push({ rows: rest.slice(0, cap), policy: false }); rest = rest.slice(cap); first = false
  }
  return { pages, compact }
}

export function QuotationDocument({ q, company: settings }: { q: PrintableQuote; company: Company }) {
  const brand = BRANDS[q.brand ?? 'ms_elbrancy']
  // Prime Roots prints its own name and slogan; MS El-brancy uses Company Settings.
  const company = brand.name ? { company_name: brand.name, slogan: brand.slogan } : settings
  const anyUnit = q.items.some((i) => i.price_basis === 'unit')
  const priceCell = (it: QuoteItem) => it.price_basis === 'unit' && it.unit_price
    ? `${fmtPrice(it.unit_price, q.currency)} / ${it.unit_label || 'unit'}`
    : anyUnit ? `${fmtPrice(it.price_per_ton, q.currency)} / ton` : fmtPrice(it.price_per_ton, q.currency)
  const qtyCell = (it: QuoteItem) => {
    if (it.quantity && it.quantity_unit === 'units') return `${it.quantity.toLocaleString('en-US')} ${unitsLabel(it.unit_label, it.quantity)}`
    const t = lineTons(it)
    return t != null ? `${+t.toFixed(3)} t` : '—'
  }
  const hasCustomer = !!(q.customer_name || q.customer_company)
  const { pages, compact } = paginate(q.items, hasCustomer ? 1 : 0)
  const showQty = q.show_quantities
  const total = showQty && q.items.length && q.items.every((i) => i.line_total != null)
    ? q.items.reduce((s, i) => s + (i.line_total ?? 0), 0) : null
  let lastRowsPage = -1
  pages.forEach((p, i) => { if (p.rows.length) lastRowsPage = i })
  const cols = showQty ? ['34%', '13%', '13%', '12%', '13%', '15%'] : ['44%', '15%', '17%', '24%']

  return (
    <div className={'quote-doc brand-' + (q.brand ?? 'ms_elbrancy')} style={{ ['--q-primary' as string]: brand.primary, ['--q-heading' as string]: brand.heading }}>
      {pages.map((pg, pi) => (
        <div className="q-page" key={pi}>
          <img className="q-bg" src={letterheadUrl(q.brand)} alt="" />
          <div className="q-content">
            {pi === 0 ? (
              <>
                <div className="q-date">
                  <div>Date: {fmtDateDMY(q.issue_date)}</div>
                  <div className="q-ref">Ref: {q.number}{q.version > 1 ? ` (rev. ${q.version})` : ''}</div>
                </div>
                <h1>Quotation</h1>
                {hasCustomer && (
                  <p className="q-to">To: <b>{[q.customer_name, q.customer_company].filter(Boolean).join(' — ')}</b>{q.customer_country ? `, ${q.customer_country}` : ''}</p>
                )}
                <p className="q-greet g">After greeting…</p>
                <p className="q-greet"><b>{company.company_name}</b> Company is honored to offer a price for the following items at hopeful price.</p>
              </>
            ) : <div className="q-cont">{q.number} — continued</div>}

            {(pg.rows.length > 0) && (
              <table className={compact ? 'compact' : ''}>
                <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <thead><tr>
                  <th>Product Description</th><th>Packing</th><th>Product type</th>
                  {showQty && <th>Quantity</th>}<th>{anyUnit ? 'Price' : 'Price/Ton'}</th>{showQty && <th>Total</th>}
                </tr></thead>
                <tbody>
                  {pg.rows.map((it, i) => {
                    return (
                      <tr key={i}>
                        <td className="l">{it.description}</td>
                        <td>{it.packing}</td>
                        <td>{it.product_type_label}</td>
                        {showQty && <td>{qtyCell(it)}</td>}
                        <td>{priceCell(it)}</td>
                        {showQty && <td>{fmtPrice(it.line_total, q.currency)}</td>}
                      </tr>
                    )
                  })}
                  {showQty && pi === lastRowsPage && (
                    <tr className="q-total"><td className="l" colSpan={5}>Total{q.incoterm ? ` (${q.incoterm}${q.destination ? ' ' + q.destination : ''})` : ''}</td><td>{fmtPrice(total, q.currency)}</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {pg.policy && (
              <>
                <div className={'q-policy' + (compact || pg.rows.length === 0 ? ' tight' : '')}>
                  <div className="t">Our Policy is:</div>
                  <ol>
                    {q.policy_lines.map((l, i) => <li key={i}>{l}</li>)}
                    {q.payment_terms && <li>Payment terms: {q.payment_terms}</li>}
                  </ol>
                </div>
                <div className="q-sign">
                  <div className="q-sign-box">Authorized signature</div>
                  <div className="q-slogan">{company.company_name}{company.slogan ? ` — ${company.slogan}` : ''}</div>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export const QUOTE_PRINT_CSS = `
@page { size: A4; margin: 0 }
.quote-doc { font-family: Arial, Helvetica, sans-serif; color: #17231e }
.quote-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box }
.q-page { position: relative; width: 210mm; height: 297mm; overflow: hidden; background: #fff; margin: 0 auto 16px; box-shadow: 0 2px 14px rgba(0,0,0,.18); page-break-after: always; break-after: page }
.q-page:last-child { page-break-after: auto; break-after: auto }
.q-bg { position: absolute; inset: 0; width: 210mm; height: 297mm; z-index: 0 }
.q-content { position: absolute; z-index: 1; left: 17mm; right: 16mm; top: 46mm }
.brand-prime_roots .q-content { top: 50mm }
.q-date { text-align: right; font-size: 11pt; color: #555; margin-right: -2mm }
.q-ref { font-size: 8.5pt; color: #777; margin-top: 1mm }
.q-cont { text-align: right; font-size: 9pt; color: #777 }
.quote-doc h1 { text-align: center; color: var(--q-heading, #176b4b); font-size: 25pt; margin: 5mm 0 8mm; font-weight: 700 }
.q-to { font-size: 9.5pt; margin: 0 0 3mm }
.q-greet { font-size: 9.5pt; margin: 0 0 3mm }
.q-greet.g { color: var(--q-primary, #176b4b); font-weight: 700 }
.quote-doc table { width: 100%; border-collapse: collapse; margin-top: 8mm; table-layout: fixed }
.quote-doc th { background: var(--q-primary, #145a3c); color: #fff; font-size: 9.5pt; padding: 4mm 2mm; border: 1px solid var(--q-primary, #145a3c); text-align: center }
.quote-doc th:first-child { text-align: left; padding-left: 5mm }
.quote-doc td { border: 1px solid #c9cfcc; padding: 4.2mm 3mm; font-size: 9.5pt; font-weight: 700; text-align: center; background: rgba(255,255,255,.88); word-wrap: break-word }
.quote-doc td.l { text-align: left; padding-left: 5mm }
.quote-doc table.compact td { padding: 2.2mm 3mm }
.quote-doc tr.q-total td { background: #eef4f1; color: var(--q-primary, #145a3c) }
.q-policy { margin-top: 12mm }
.q-policy.tight { margin-top: 6mm }
.q-policy .t { font-size: 9.5pt; font-weight: 700; color: var(--q-primary, #176b4b) }
.q-policy ol { margin: 3mm 0 0 8mm; padding: 0; font-size: 9.5pt; line-height: 1.8; list-style: decimal }
.q-policy li { padding-left: 1mm }
.q-sign { margin-top: 6mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm }
.q-sign-box { width: 60mm; border-top: 1px solid #9aa5a0; padding-top: 1.5mm; font-size: 8.5pt; color: #555 }
.q-slogan { font-size: 8.5pt; color: #176b4b; font-style: italic; text-align: right }
@media print {
  html, body { background: #fff !important; margin: 0 }
  .print-wrap { padding: 0 !important; background: #fff !important; min-height: 0 !important }
  .no-print { display: none !important }
  .q-page { margin: 0; box-shadow: none }
}
`
