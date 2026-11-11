import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { T, TV } from '@/lib/i18n'
import { activePackaging, fetchCatalog, MONTHS, productImageUrl, seasonMonths, type Category, type Product } from '@/lib/catalog'
import { BRANDS, fmtDateDMY, type Brand } from '@/lib/quotations'
import { letterheadUrl, QUOTE_PRINT_CSS } from '@/components/quotations/QuotationDocument'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ErrorState, Loading } from '@/components/ui/states'

// ---------------------------------------------------------------------
// Product catalog PDF on the company letterhead: photo, varieties, season,
// packing and MOQ for each product. No prices (they change; send a quotation).
// ---------------------------------------------------------------------

type Lang = 'en' | 'ar'
const TXT = {
  en: { title: 'Product Catalog', varieties: 'Varieties', season: 'Season', allYear: 'All year', packing: 'Packing', moq: 'Min. order', origin: 'Origin', egypt: 'Egypt', note: 'Prices on request — ask us for a quotation.', date: 'Date' },
  ar: { title: 'كتالوج المنتجات', varieties: 'الأصناف', season: 'الموسم', allYear: 'طوال العام', packing: 'التعبئة', moq: 'أقل كمية', origin: 'المنشأ', egypt: 'مصر', note: 'الأسعار عند الطلب — اطلبوا عرض سعر.', date: 'التاريخ' },
}
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const FIRST = 4, NEXT = 6

/** Splits the products into letterhead pages: 4 under the title, then 6 per page. */
export function catalogPages<T>(items: T[]): T[][] {
  const out: T[][] = [items.slice(0, FIRST)]
  for (let i = FIRST; i < items.length; i += NEXT) out.push(items.slice(i, i + NEXT))
  return out
}

export function CatalogPrint() {
  const [params, setParams] = useSearchParams()
  const brand = (params.get('brand') === 'prime_roots' ? 'prime_roots' : 'ms_elbrancy') as Brand
  const lang = (params.get('lang') === 'ar' ? 'ar' : 'en') as Lang
  const cat = params.get('cat') ?? ''
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }
  const [data, setData] = useState<{ products: Product[]; categories: Category[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { fetchCatalog().then(setData).catch((e) => setError(e.message)); document.title = 'Product catalog' }, [])

  const list = useMemo(() => (data?.products ?? [])
    .filter((p) => !p.archived_at && p.availability !== 'discontinued')
    .filter((p) => (brand === 'prime_roots') === (p.product_type === 'jam')) // Prime Roots = jams only
    .filter((p) => !cat || p.category_id === cat)
    .sort((a, b) => Number(!!b.image_path) - Number(!!a.image_path) || a.name.localeCompare(b.name)), [data, brand, cat])
  const cats = useMemo(() => (data?.categories ?? []).filter((c) => !c.archived_at && (brand === 'prime_roots') === (c.product_type === 'jam')), [data, brand])
  const noPhoto = list.filter((p) => !p.image_path).length

  return (
    <div className="print-wrap min-h-screen bg-[#e9ecea] py-4">
      <style>{QUOTE_PRINT_CSS + CATALOG_CSS}</style>
      <div className="no-print mx-auto mb-4 w-[210mm] max-w-full space-y-3 px-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" onClick={() => { if (window.opener) window.close(); else history.back() }}><ArrowLeft />Back</Button>
          <span className="text-sm text-muted-foreground"><T>Choose “Save as PDF” as the printer to get a PDF file.</T></span>
          <Button onClick={() => window.print()} disabled={!list.length}><Printer />Print / Save as PDF</Button>
        </div>
        <div className="grid gap-2 rounded-xl bg-card p-3 shadow-sm sm:grid-cols-3">
          <Select aria-label="Letterhead" value={brand} onChange={(e) => { const p = new URLSearchParams(params); p.set('brand', e.target.value); p.delete('cat'); setParams(p, { replace: true }) }}>
            {Object.entries(BRANDS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}
          </Select>
          <Select aria-label="Language" value={lang} onChange={(e) => set('lang', e.target.value === 'ar' ? 'ar' : '')}>
            <option value="en">English</option><option value="ar">العربية</option>
          </Select>
          <Select aria-label="Category" value={cat} onChange={(e) => set('cat', e.target.value)}>
            <option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {data && <p className="text-xs text-muted-foreground sm:col-span-3">
            <TV k="{n} products" v={{ n: list.length }} />{noPhoto > 0 && <> · <TV k="{n} without a photo (add photos from Products → open a product)" v={{ n: noPhoto }} /></>}
          </p>}
        </div>
      </div>
      {error ? <div className="mx-auto max-w-md"><ErrorState message={error} /></div>
        : !data ? <Loading />
        : !list.length ? <div className="mx-auto max-w-md rounded-xl bg-card p-6 text-center text-sm text-muted-foreground"><T>No products to show for this letterhead and category.</T></div>
        : <CatalogDocument products={list} brand={brand} lang={lang} />}
    </div>
  )
}

function CatalogDocument({ products, brand, lang }: { products: Product[]; brand: Brand; lang: Lang }) {
  const t = TXT[lang]
  const b = BRANDS[brand]
  const season = (p: Product) => {
    if (!p.season_start_month || !p.season_end_month) return null
    if (seasonMonths(p.season_start_month, p.season_end_month).size === 12) return t.allYear
    const m = lang === 'ar' ? MONTHS_AR : MONTHS
    return `${m[p.season_start_month - 1]} – ${m[p.season_end_month - 1]}`
  }
  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className={`quote-doc catalog-doc brand-${brand} lang-${lang}`} style={{ ['--q-primary' as string]: b.primary, ['--q-heading' as string]: b.heading }}>
      {catalogPages(products).map((page, pi) => (
        <div className="q-page" key={pi}>
          <img className="q-bg" src={letterheadUrl(brand)} alt="" />
          <div className="q-content">
            {pi === 0 && <>
              <div className="q-date">{t.date}: <span dir="ltr">{fmtDateDMY(new Date().toISOString().slice(0, 10))}</span></div>
              <h1>{t.title}</h1>
            </>}
            <div className="c-grid">
              {page.map((p) => {
                const src = productImageUrl(p.image_path)
                const packs = activePackaging(p).slice(0, 2).map((x) => x.label)
                const name = lang === 'ar' && p.name_ar ? p.name_ar : p.name
                const s = season(p)
                return (
                  <div className="c-card" key={p.id}>
                    <div className="c-photo">{src ? <img src={src} alt="" /> : <span>{name}</span>}</div>
                    <div className="c-body">
                      <div className="c-name">{name}</div>
                      {p.varieties.length > 0 && <div className="c-row"><b>{t.varieties}:</b> {p.varieties.join(lang === 'ar' ? '، ' : ', ')}</div>}
                      <div className="c-row"><b>{t.origin}:</b> {p.origin || t.egypt}</div>
                      {s && <div className="c-row"><b>{t.season}:</b> {s}</div>}
                      {packs.length > 0 && <div className="c-row"><b>{t.packing}:</b> {packs.join(' · ')}</div>}
                      {p.moq_quantity && <div className="c-row"><b>{t.moq}:</b> <span dir="ltr">{p.moq_quantity} {p.moq_unit ?? ''}</span></div>}
                    </div>
                  </div>
                )
              })}
            </div>
            {pi === catalogPages(products).length - 1 && <p className="c-note">{t.note}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

const CATALOG_CSS = `
.catalog-doc h1 { margin: 2mm 0 6mm }
.c-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm }
.c-card { display: flex; gap: 3mm; height: 55mm; border: 1px solid #d5dbd8; border-radius: 3mm; background: rgba(255,255,255,.92); overflow: hidden }
.c-photo { width: 36mm; flex-shrink: 0; background: #eef4f1; display: grid; place-items: center; text-align: center; padding: 0 }
.c-photo img { width: 100%; height: 100%; object-fit: cover }
.c-photo span { padding: 3mm; font-size: 10pt; font-weight: 700; color: var(--q-primary, #145a3c) }
.c-body { padding: 3mm 3mm 3mm 0; min-width: 0; font-size: 8.5pt; line-height: 1.45 }
.lang-ar .c-body { padding: 3mm 0 3mm 3mm }
.c-name { font-size: 11.5pt; font-weight: 700; color: var(--q-primary, #145a3c); margin-bottom: 1.5mm; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
.c-row { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: .8mm; color: #2c3a34 }
.c-row b { color: #5b6a63; font-weight: 600 }
.c-note { margin-top: 5mm; text-align: center; font-size: 9pt; font-style: italic; color: var(--q-primary, #145a3c) }
`
