import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { canAccess, type ModuleKey } from '@/lib/roles'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { cleanTerm } from '@/lib/search'

type Hit = { group: string; id: string; title: string; sub: string; to: string }


// Each source only runs if the role can open that module; the database (RLS) still decides which rows come back.
const SOURCES: { module: ModuleKey; group: string; run: (t: string) => PromiseLike<Hit[]> }[] = [
  { module: 'crm', group: 'Companies', run: (t) => supabase.from('companies').select('id, name, country').or(`name.ilike.*${t}*,email.ilike.*${t}*,website.ilike.*${t}*`).is('archived_at', null).limit(6)
    .then(({ data }) => (data ?? []).map((r) => ({ group: 'Companies', id: r.id, title: r.name, sub: r.country ?? '', to: `/crm/${r.id}` }))) },
  { module: 'quotations', group: 'Quotations', run: (t) => supabase.from('quotations').select('id, number, customer_company, status').or(`number.ilike.*${t}*,customer_company.ilike.*${t}*`).limit(5)
    .then(({ data }) => (data ?? []).map((r) => ({ group: 'Quotations', id: r.id, title: r.number, sub: `${r.customer_company ?? '—'} · ${r.status}`, to: `/quotations/${r.id}` }))) },
  { module: 'proformas', group: 'Proforma invoices', run: (t) => supabase.from('proforma_invoices').select('id, number, customer_company, status').or(`number.ilike.*${t}*,customer_company.ilike.*${t}*`).limit(5)
    .then(({ data }) => (data ?? []).map((r) => ({ group: 'Proforma invoices', id: r.id, title: r.number ?? 'Draft', sub: `${r.customer_company ?? '—'} · ${r.status}`, to: `/proformas/${r.id}` }))) },
  { module: 'orders', group: 'Orders', run: (t) => supabase.from('sales_orders').select('id, number, customer_company, stage').or(`number.ilike.*${t}*,customer_company.ilike.*${t}*,bl_awb_number.ilike.*${t}*,container_numbers.ilike.*${t}*`).limit(5)
    .then(({ data }) => (data ?? []).map((r) => ({ group: 'Orders', id: r.id, title: r.number, sub: `${r.customer_company ?? '—'} · ${r.stage}`, to: `/orders/${r.id}` }))) },
  { module: 'products', group: 'Products', run: (t) => supabase.from('products').select('id, name').ilike('name', `%${t}%`).is('archived_at', null).limit(5)
    .then(({ data }) => (data ?? []).map((r) => ({ group: 'Products', id: r.id, title: r.name, sub: '', to: '/products' }))) },
  { module: 'suppliers', group: 'Suppliers', run: (t) => supabase.from('suppliers').select('id, name, city').ilike('name', `%${t}%`).is('archived_at', null).limit(5)
    .then(({ data }) => (data ?? []).map((r) => ({ group: 'Suppliers', id: r.id, title: r.name, sub: r.city ?? '', to: '/suppliers' }))) },
  { module: 'research', group: 'Market research', run: (t) => supabase.from('research_leads').select('id, company_name, country').ilike('company_name', `%${t}%`).is('archived_at', null).limit(5)
    .then(({ data }) => (data ?? []).map((r) => ({ group: 'Market research', id: r.id, title: r.company_name, sub: r.country ?? '', to: '/research' }))) },
]

export function GlobalSearch() {
  const { roles } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable
      // Ctrl/Cmd+K anywhere, or "/" when not typing, opens search
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) { e.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  useEffect(() => { if (!open) { setQ(''); setHits([]) } }, [open])
  useEffect(() => {
    const t = cleanTerm(q)
    if (t.length < 2) { setHits([]); return }
    const my = ++seq.current
    setBusy(true)
    const h = setTimeout(async () => {
      const res = await Promise.all(SOURCES.filter((s) => canAccess(roles, s.module)).map((s) => Promise.resolve(s.run(t)).catch(() => [] as Hit[])))
      if (my !== seq.current) return
      setHits(res.flat()); setSel(0); setBusy(false)
    }, 250)
    return () => clearTimeout(h)
  }, [q, roles])

  function go(h: Hit) { setOpen(false); nav(h.to) }
  let lastGroup = ''
  return (
    <>
      <Button variant="outline" className="hidden h-9 w-56 justify-start gap-2 text-muted-foreground sm:inline-flex" onClick={() => setOpen(true)}>
        <Search className="size-4" /><span className="flex-1 text-left">Search…</span><kbd className="rounded border border-border px-1.5 text-[10px]">Ctrl K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setOpen(true)} aria-label="Search"><Search /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 p-0">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border pl-4 pr-12">
            <Search className="size-4 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company, quotation or order number, B/L, product…"
              className="h-12 flex-1 bg-transparent text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
                if (e.key === 'Enter' && hits[sel]) go(hits[sel])
              }} />
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {cleanTerm(q).length < 2 ? <p className="p-4 text-center text-sm text-muted-foreground">Type at least 2 letters.</p>
              : busy && !hits.length ? <p className="p-4 text-center text-sm text-muted-foreground">Searching…</p>
              : !hits.length ? <p className="p-4 text-center text-sm text-muted-foreground">Nothing found.</p>
              : hits.map((h, i) => {
                const head = h.group !== lastGroup ? (lastGroup = h.group) : null
                return (
                  <div key={h.group + h.id}>
                    {head && <div className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{head}</div>}
                    <button onClick={() => go(h)} onMouseEnter={() => setSel(i)}
                      className={cn('flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm', i === sel && 'bg-accent')}>
                      <span className="truncate font-medium">{h.title}</span><span className="ml-auto truncate text-xs text-muted-foreground">{h.sub}</span>
                    </button>
                  </div>
                )
              })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
