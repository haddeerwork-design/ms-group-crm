import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BRANDS, fmtDateDMY, fmtPrice, lineTons, policySections, QUOTE_TEXT, unitWord, type Brand, type QuoteItem, type QuoteLang } from '@/lib/quotations'

/** Data needed to print. Works for the live quotation and for saved versions. */
export type PrintableQuote = {
  number: string; version: number; issue_date: string; valid_until: string | null; currency: string
  incoterm: string | null; destination: string | null; payment_terms: string | null
  customer_name: string | null; customer_company: string | null; customer_country: string | null
  policy_lines: string[]; show_quantities: boolean; items: QuoteItem[]
  brand?: Brand | null; language?: QuoteLang | null
}
type Company = { company_name: string; slogan: string | null }

export const letterheadUrl = (b?: Brand | null) => `${import.meta.env.BASE_URL}${BRANDS[b ?? 'ms_elbrancy'].letterhead}`

// Writable height of each letterhead, from the top of the content to just above its footer.
const MAX_CONTENT_MM: Record<Brand, number> = { ms_elbrancy: 180, prime_roots: 204 }

/** Starts optimistic (everything on one page) and is tightened by `shrink`
 *  until every rendered page fits its letterhead (measured in the browser). */
function paginate<T>(rows: T[], shrink: number) {
  const compact = rows.length > 4
  const firstCap = Math.max(1, 16 - shrink), firstCapPolicy = 12 - shrink
  const nextCap = Math.max(1, 22 - shrink), nextCapPolicy = 16 - shrink
  const pages: { rows: T[]; policy: boolean }[] = []
  let rest = rows, first = true
  for (;;) {
    const cap = first ? firstCap : nextCap, capP = first ? firstCapPolicy : nextCapPolicy
    if (capP >= 0 && rest.length <= capP) { pages.push({ rows: rest, policy: true }); break }
    if (rest.length <= cap) { pages.push({ rows: rest, policy: false }, { rows: [], policy: true }); break }
    pages.push({ rows: rest.slice(0, cap), policy: false }); rest = rest.slice(cap); first = false
  }
  return { pages, compact }
}

export function QuotationDocument({ q, company: settings }: { q: PrintableQuote; company: Company }) {
  const brand = BRANDS[q.brand ?? 'ms_elbrancy']
  // Prime Roots prints its own name and slogan; MS El-brancy uses Company Settings.
  const company = brand.name ? { company_name: brand.name, slogan: brand.slogan } : settings
  const lang: QuoteLang = q.language ?? 'en'
  const T = QUOTE_TEXT[lang]
  const anyUnit = q.items.some((i) => i.price_basis && i.price_basis !== 'ton')
  // amounts keep left-to-right order inside Arabic text
  const M = (v: number | null) => <bdi dir="ltr">{fmtPrice(v, q.currency)}</bdi>
  const priceCell = (it: QuoteItem) => it.price_basis && it.price_basis !== 'ton' && it.unit_price
    ? <>{M(it.unit_price)} / {unitWord(it.price_basis === 'kg' ? 'kg' : it.price_basis === 'pallet' ? 'pallet' : it.unit_label, lang, 1)}</>
    : anyUnit ? <>{M(it.price_per_ton)} / {T.ton}</> : M(it.price_per_ton)
  const qtyCell = (it: QuoteItem) => {
    if (it.quantity && it.quantity_unit === 'units') return `${it.quantity.toLocaleString('en-US')} ${unitWord(it.unit_label, lang, it.quantity)}`
    const t = lineTons(it)
    return t != null ? `${+t.toFixed(3)} ${T.tons}` : '—'
  }
  const honored = T.honored(company.company_name)
  const hasCustomer = !!(q.customer_name || q.customer_company)
  // When a page is too tall: first make the layout denser (2 steps), then move rows to more pages.
  const [dense, setDense] = useState(0)
  const [shrink, setShrink] = useState(0)
  const [, setFontsTick] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const maxMm = MAX_CONTENT_MM[q.brand ?? 'ms_elbrancy']
  // content or fonts changed → start optimistic again and re-measure
  const key = JSON.stringify([q.items.length, q.policy_lines, q.language, q.brand, q.show_quantities, hasCustomer])
  useEffect(() => { setShrink(0); setDense(0) }, [key])
  useEffect(() => { document.fonts?.ready.then(() => { setShrink(0); setDense(0); setFontsTick((x) => x + 1) }) }, [])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || shrink > 24) return
    const px = maxMm * (96 / 25.4)
    if ([...el.querySelectorAll<HTMLElement>('.q-content')].some((c) => c.offsetHeight > px)) {
      if (dense < 2) setDense((x) => x + 1); else setShrink((x) => x + 1)
    }
  })
  const sections = policySections(q.policy_lines)
  const titled = sections.some((x) => x.title)
  const { pages, compact } = paginate(q.items, shrink)
  const showQty = q.show_quantities
  const total = showQty && q.items.length && q.items.every((i) => i.line_total != null)
    ? q.items.reduce((s, i) => s + (i.line_total ?? 0), 0) : null
  let lastRowsPage = -1
  pages.forEach((p, i) => { if (p.rows.length) lastRowsPage = i })
  const cols = showQty ? ['30%', '16%', '12%', '12%', '14%', '16%'] : ['44%', '15%', '17%', '24%']

  return (
    <div ref={ref} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className={'quote-doc brand-' + (q.brand ?? 'ms_elbrancy') + ' lang-' + lang + (dense ? ' dense-1' : '') + (dense > 1 ? ' dense-2' : '')} style={{ ['--q-primary' as string]: brand.primary, ['--q-heading' as string]: brand.heading }}>
      {pages.map((pg, pi) => (
        <div className="q-page" key={pi}>
          <img className="q-bg" src={letterheadUrl(q.brand)} alt="" />
          <div className="q-content">
            {pi === 0 ? (
              <>
                <div className="q-date">
                  <div>{T.date}: <span dir="ltr">{fmtDateDMY(q.issue_date)}</span></div>
                  <div className="q-ref">{T.ref}: <span dir="ltr">{q.number}</span>{q.version > 1 ? ` (${T.rev} ${q.version})` : ''}</div>
                </div>
                <h1>{T.title}</h1>
                {hasCustomer && (
                  <p className="q-to">{T.to}: <b>{[q.customer_name, q.customer_company].filter(Boolean).join(' — ')}</b>{q.customer_country ? `${lang === 'ar' ? '، ' : ', '}${q.customer_country}` : ''}</p>
                )}
                <p className="q-greet g">{T.greeting}</p>
                <p className="q-greet">{lang === 'ar'
                  ? <>{honored[0]}<b>{honored[1]}</b>{honored[2]}</>
                  : <><b>{honored[0]}</b>{honored[1]}</>}</p>
              </>
            ) : <div className="q-cont"><span dir="ltr">{q.number}</span> — {T.continued}</div>}

            {(pg.rows.length > 0) && (
              <table className={compact ? 'compact' : ''}>
                <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <thead><tr>
                  <th>{T.description}</th><th>{T.packing}</th><th>{T.type}</th>
                  {showQty && <th>{T.quantity}</th>}<th>{anyUnit ? T.price : T.pricePerTon}</th>{showQty && <th>{T.total}</th>}
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
                        {showQty && <td>{M(it.line_total)}</td>}
                      </tr>
                    )
                  })}
                  {showQty && pi === lastRowsPage && (
                    <tr className="q-total"><td className="l" colSpan={5}>{T.total}{q.incoterm ? ` (${q.incoterm}${q.destination ? ' ' + q.destination : ''})` : ''}</td><td>{M(total)}</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {pg.policy && (
              <>
                <div className={'q-policy' + (compact || pg.rows.length === 0 || titled ? ' tight' : '')}>
                  {titled ? sections.map((sec, si) => (
                    <div className="q-sec" key={si}>
                      {sec.title && <div className="t">{sec.title}</div>}
                      <ul>
                        {sec.items.map((l, i) => <li key={i}>{l}</li>)}
                        {si === 0 && q.payment_terms && <li>{T.payment}: {q.payment_terms}</li>}
                      </ul>
                    </div>
                  )) : (
                    <>
                      <div className="t">{T.policy}</div>
                      <ol>
                        {q.policy_lines.map((l, i) => <li key={i}>{l}</li>)}
                        {q.payment_terms && <li>{T.payment}: {q.payment_terms}</li>}
                      </ol>
                    </>
                  )}
                </div>
                <div className="q-sign">
                  <div className="q-sign-box">{T.signature}</div>
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
.q-date { text-align: end; font-size: 11pt; color: #555; margin-inline-end: -2mm }
.q-ref { font-size: 8.5pt; color: #777; margin-top: 1mm }
.q-cont { text-align: end; font-size: 9pt; color: #777 }
.quote-doc h1 { text-align: center; color: var(--q-heading, #176b4b); font-size: 25pt; margin: 5mm 0 8mm; font-weight: 700 }
.q-to { font-size: 9.5pt; margin: 0 0 3mm }
.q-greet { font-size: 9.5pt; margin: 0 0 3mm }
.q-greet.g { color: var(--q-primary, #176b4b); font-weight: 700 }
.quote-doc table { width: 100%; border-collapse: collapse; margin-top: 8mm; table-layout: fixed }
.quote-doc th { background: var(--q-primary, #145a3c); color: #fff; font-size: 9.5pt; padding: 4mm 2mm; border: 1px solid var(--q-primary, #145a3c); text-align: center }
.quote-doc th:first-child { text-align: start; padding-inline-start: 5mm }
.quote-doc td { border: 1px solid #c9cfcc; padding: 4.2mm 3mm; font-size: 9.5pt; font-weight: 700; text-align: center; background: rgba(255,255,255,.88); word-wrap: break-word }
.quote-doc td.l { text-align: start; padding-inline-start: 5mm }
.quote-doc table.compact td { padding: 2.2mm 3mm }
.quote-doc tr.q-total td { background: #eef4f1; color: var(--q-primary, #145a3c) }
.q-policy { margin-top: 12mm }
.q-policy.tight { margin-top: 6mm }
.q-policy .t { font-size: 9.5pt; font-weight: 700; color: var(--q-primary, #176b4b) }
.q-policy ol { margin: 3mm 0 0; margin-inline-start: 8mm; padding: 0; font-size: 9.5pt; line-height: 1.8; list-style: decimal }
.q-policy li { padding-inline-start: 1mm }
.q-policy ul { margin: 1mm 0 0; margin-inline-start: 6mm; padding: 0; font-size: 9pt; line-height: 1.55; list-style: disc }
.q-sec + .q-sec { margin-top: 2.5mm }
.quote-doc.dense-1 h1 { font-size: 20pt; margin: 1mm 0 4mm }
.quote-doc.dense-1 .q-to, .quote-doc.dense-1 .q-greet { margin-bottom: 1.5mm }
.quote-doc.dense-1 table { margin-top: 4mm }
.quote-doc.dense-1 th { padding: 2.5mm 2mm }
.quote-doc.dense-1 td { padding: 2.2mm 2.5mm }
.quote-doc.dense-1 .q-policy, .quote-doc.dense-1 .q-policy.tight { margin-top: 4mm }
.quote-doc.dense-1 .q-sign { margin-top: 4mm }
.quote-doc.dense-2 .q-date { font-size: 10pt }
.quote-doc.dense-2 th, .quote-doc.dense-2 td { font-size: 8.5pt }
.quote-doc.dense-2 td { padding: 1.6mm 2mm }
.quote-doc.dense-2 .q-policy ul, .quote-doc.dense-2 .q-policy ol { font-size: 8.5pt; line-height: 1.4 }
.quote-doc.dense-2 .q-sec + .q-sec { margin-top: 1.5mm }
.quote-doc.lang-ar { font-family: 'IBM Plex Sans Arabic', Arial, sans-serif }
.quote-doc.lang-ar .q-policy ol { list-style: arabic-indic }
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
