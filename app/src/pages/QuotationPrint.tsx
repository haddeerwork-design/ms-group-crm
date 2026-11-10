import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchQuotation } from '@/lib/quotations'
import { letterheadUrl, QuotationDocument, QUOTE_PRINT_CSS, type PrintableQuote } from '@/components/quotations/QuotationDocument'
import { Button } from '@/components/ui/button'
import { ErrorState, Loading } from '@/components/ui/states'

export function QuotationPrint() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const v = params.get('v')
  const [doc, setDoc] = useState<PrintableQuote | null>(null)
  const [company, setCompany] = useState<{ company_name: string; slogan: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([fetchQuotation(id), supabase.from('company_settings').select('company_name, slogan').eq('id', 1).single()])
      .then(([{ quote, versions }, cs]) => {
        if (cs.error) throw cs.error
        setCompany(cs.data)
        const src = v ? versions.find((x) => String(x.version) === v)?.snapshot : null
        if (v && !src) throw new Error(`Version ${v} not found`)
        const q = src ?? quote
        setDoc({ ...q, items: (src ? src.items : quote.quotation_items) ?? [] })
        document.title = `${q.number}${q.version > 1 ? ' rev ' + q.version : ''}`
      }).catch((e) => setError(e.message))
  }, [id, v])

  useEffect(() => {
    if (!doc) return
    // wait for the letterhead image before opening the print dialog
    // wait for the letterhead image and the fonts (Arabic uses IBM Plex Sans Arabic) before printing
    const img = new Image(); img.src = letterheadUrl(doc.brand)
    const go = () => setTimeout(() => { document.fonts.ready.then(() => window.print()) }, 600)
    if (img.complete) go(); else img.onload = go
  }, [doc])

  return (
    <div className="print-wrap min-h-screen bg-[#e9ecea] py-4">
      <style>{QUOTE_PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between gap-2 px-2">
        <Button variant="outline" onClick={() => { if (window.opener) window.close(); else history.back() }}><ArrowLeft />Back</Button>
        <span className="text-sm text-muted-foreground">Choose “Save as PDF” as the printer to get a PDF file.</span>
        <Button onClick={() => window.print()} disabled={!doc}><Printer />Print / Save as PDF</Button>
      </div>
      {error ? <div className="mx-auto max-w-md"><ErrorState message={error} /></div>
        : !doc || !company ? <Loading /> : <QuotationDocument q={doc} company={company} />}
    </div>
  )
}
