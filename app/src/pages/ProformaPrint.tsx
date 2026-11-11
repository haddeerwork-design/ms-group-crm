import { letterheadUrl } from '@/components/quotations/QuotationDocument'
import { T } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchProforma } from '@/lib/proformas'
import { QUOTE_PRINT_CSS } from '@/components/quotations/QuotationDocument'
import { PI_EXTRA_CSS, ProformaDocument, type PrintablePI } from '@/components/proforma/ProformaDocument'
import { Button } from '@/components/ui/button'
import { ErrorState, Loading } from '@/components/ui/states'

export function ProformaPrint() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const v = params.get('v')
  const [doc, setDoc] = useState<PrintablePI | null>(null)
  const [company, setCompany] = useState<{ company_name: string; slogan: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    Promise.all([fetchProforma(id), supabase.from('company_settings').select('company_name, slogan').eq('id', 1).single()]).then(([{ pi, versions }, cs]) => {
      if (cs.error) throw cs.error
      setCompany(cs.data)
      const snap = v ? versions.find((x) => String(x.version) === v)?.snapshot : null
      if (v && !snap) throw new Error(`Version ${v} not found`)
      const src = snap ?? pi
      setDoc({ ...src, items: (snap ? snap.items : pi.proforma_items) ?? [] })
      document.title = `${src.number}${src.version > 1 ? ' rev ' + src.version : ''}`
    }).catch((e) => setError(e.message))
  }, [id, v])
  useEffect(() => {
    if (!doc) return
    const img = new Image(); img.src = letterheadUrl(doc.brand)
    const go = () => setTimeout(() => window.print(), 300)
    if (img.complete) go(); else img.onload = go
  }, [doc])
  return (
    <div className="print-wrap min-h-screen bg-[#e9ecea] py-4">
      <style>{QUOTE_PRINT_CSS + PI_EXTRA_CSS}</style>
      <div className="no-print mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between gap-2 px-2">
        <Button variant="outline" onClick={() => { if (window.opener) window.close(); else history.back() }}><ArrowLeft />Back</Button>
        <span className="text-sm text-muted-foreground"><T>Choose “Save as PDF” as the printer to get a PDF file.</T></span>
        <Button onClick={() => window.print()} disabled={!doc}><Printer />Print / Save as PDF</Button>
      </div>
      {error ? <div className="mx-auto max-w-md"><ErrorState message={error} /></div> : !doc || !company ? <Loading /> : <ProformaDocument p={doc} company={company} />}
    </div>
  )
}
