import { T } from '@/lib/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { archivedToast } from '@/lib/undo'
import { useAuth } from '@/lib/auth'
import { COST_VIEWERS, CRM_ASSIGNERS } from '@/lib/roles'
import { CURRENCIES } from '@/lib/pricing'
import { fetchCatalog, type Product } from '@/lib/catalog'
import { money } from '@/lib/prices'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { fromRow, SimpleFormDialog, toRow, type FieldSpec } from '@/components/ui/simple-form'
import { cn } from '@/lib/utils'

type Supplier = Record<string, string | null> & { id: string; name: string; archived_at: string | null }
type SPrice = { id: string; supplier_id: string; product_id: string | null; product_text: string | null; packaging: string | null; price: number; unit: string; currency: string; quantity_available: string | null; valid_from: string; valid_until: string | null; notes: string | null; created_at: string }

const CATS = ['Fresh', 'Frozen', 'Jam', 'Packaging', 'Transport', 'Other']
const S_FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Supplier name', required: true, span: 2 }, { key: 'category', label: 'Category', type: 'select', options: [{ value: '', label: '—' }, ...CATS.map((c) => ({ value: c, label: c }))] },
  { key: 'country', label: 'Country' }, { key: 'city', label: 'City' }, { key: 'website', label: 'Website' },
  { key: 'contact_name', label: 'Contact person' }, { key: 'job_title', label: 'Job title' }, { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'lead_time', label: 'Lead time' },
  { key: 'products_text', label: 'Products supplied', span: 3 }, { key: 'payment_terms', label: 'Payment terms' }, { key: 'delivery_terms', label: 'Delivery terms' },
  { key: 'certifications', label: 'Certifications', placeholder: 'GlobalG.A.P., ISO 22000…' }, { key: 'address', label: 'Address', span: 3 }, { key: 'notes', label: 'Notes', type: 'textarea', span: 3 },
]

export function Suppliers() {
  const { hasRole, session } = useAuth()
  const canEdit = hasRole(...CRM_ASSIGNERS)
  const seesCosts = hasRole(...COST_VIEWERS)
  const [rows, setRows] = useState<Supplier[] | null>(null)
  const [prices, setPrices] = useState<SPrice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [arch, setArch] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null); const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [priceOpen, setPriceOpen] = useState(false)
  const [compareProduct, setCompareProduct] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, cat] = await Promise.all([supabase.from('suppliers').select('*').order('name'), fetchCatalog()])
      if (s.error) throw s.error
      setRows(s.data as Supplier[]); setProducts(cat.products)
      if (seesCosts) { const p = await supabase.from('supplier_prices').select('*').order('created_at', { ascending: false }); if (!p.error) setPrices(p.data as SPrice[]) }
    } catch (e) { setError((e as Error).message) }
  }, [seesCosts])
  useEffect(() => { load() }, [load])

  const prod = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])
  const sup = useMemo(() => Object.fromEntries((rows ?? []).map((s) => [s.id, s])), [rows])
  const list = (rows ?? []).filter((s) => (arch ? !!s.archived_at : !s.archived_at) && (!cat || s.category === cat)
    && (!q.trim() || [s.name, s.country, s.city, s.products_text, s.contact_name, s.email].some((x) => (x ?? '').toLowerCase().includes(q.trim().toLowerCase()))))
  const sel = selected ? sup[selected] : null
  const selPrices = prices.filter((p) => p.supplier_id === selected)
  const pName = (p: SPrice) => (p.product_id ? prod[p.product_id]?.name : null) ?? p.product_text ?? '—'

  // comparison: latest price per supplier for a product
  const comparison = useMemo(() => {
    if (!compareProduct) return []
    const latest = new Map<string, SPrice>()
    for (const p of prices) if (p.product_id === compareProduct && !latest.has(p.supplier_id)) latest.set(p.supplier_id, p)
    return [...latest.values()].sort((a, b) => a.currency.localeCompare(b.currency) || a.price - b.price)
  }, [compareProduct, prices])

  async function saveSupplier(v: Record<string, string>) {
    const { row } = toRow(v)
    const res = editing ? await supabase.from('suppliers').update(row).eq('id', editing.id).select('id') : await supabase.from('suppliers').insert(row).select('id')
    if (res.error) { toast.error(res.error.message.includes('name_uq') ? 'A supplier with this name already exists.' : res.error.message); return false }
    toast.success('Supplier saved'); load(); return true
  }
  async function savePrice(v: Record<string, string>) {
    const { row, error } = toRow(v, ['price'])
    if (error) { toast.error(error); return false }
    if (!(row.price as number > 0)) { toast.error('Price must be above 0.'); return false }
    if (!row.product_id && !row.product_text) { toast.error('Choose a product or type its name.'); return false }
    const res = await supabase.from('supplier_prices').insert({ ...row, supplier_id: selected, created_by: session?.user.id })
    if (res.error) { toast.error(res.error.message); return false }
    toast.success('Supplier price saved'); load(); return true
  }
  async function toggleArchive(s: Supplier) {
    const { error } = await supabase.from('suppliers').update({ archived_at: s.archived_at ? null : new Date().toISOString() }).eq('id', s.id)
    if (error) return toast.error(error.message)
    if (!s.archived_at) archivedToast(`“${s.name}”`, 'suppliers', s.id, load); else toast.success('Supplier restored')
    load()
  }

  if (error) return <ErrorState message={error} />
  if (!rows) return <Loading />
  const priceFields: FieldSpec[] = [
    { key: 'product_id', label: 'Product', type: 'select', span: 2, options: [{ value: '', label: '— type below —' }, ...products.filter((p) => !p.archived_at).sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.id, label: `${p.name} (${p.product_type})` }))] },
    { key: 'product_text', label: 'or product name' }, { key: 'packaging', label: 'Packaging' },
    { key: 'price', label: 'Price', type: 'number', required: true }, { key: 'unit', label: 'Per', type: 'select', options: ['kg', 'ton', 'carton', 'piece'].map((u) => ({ value: u, label: u })) },
    { key: 'currency', label: 'Currency', type: 'select', options: CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: 'quantity_available', label: 'Quantity available' }, { key: 'valid_from', label: 'Valid from', type: 'date' }, { key: 'valid_until', label: 'Valid until', type: 'date' },
    { key: 'notes', label: 'Notes', span: 3 },
  ]

  return (
    <>
      <PageHeader title="Suppliers" summary="Farms, packers and packaging suppliers, with their quoted prices."
        action={canEdit && <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus />Add supplier</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-8" placeholder="Search supplier, product, contact…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="w-40"><Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</Select></div>
        <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground"><input type="checkbox" className="size-4 accent-[#23856B]" checked={arch} onChange={(e) => setArch(e.target.checked)} />Archived</label>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3"><CardContent className="overflow-x-auto p-0">
          {!list.length ? <div className="p-5"><Empty title="No suppliers" hint={canEdit ? 'Add your farms, packers and packaging suppliers.' : undefined}
            action={canEdit && <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus />Add supplier</Button>} /></div> : (
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3 font-medium"><T>Supplier</T></th><th className="px-3 py-3 font-medium"><T>Location</T></th><th className="px-3 py-3 font-medium"><T>Products</T></th><th className="px-3 py-3" /></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} onClick={() => setSelected(s.id)} className={cn('cursor-pointer border-b border-border last:border-0 hover:bg-accent/50', selected === s.id && 'bg-accent')}>
                    <td className="px-5 py-3"><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{[s.category, s.contact_name, s.phone].filter(Boolean).join(' · ')}</div></td>
                    <td className="px-3 py-3 text-muted-foreground">{[s.city, s.country].filter(Boolean).join(', ')}</td>
                    <td className="max-w-[200px] truncate px-3 py-3 text-muted-foreground">{s.products_text ?? '—'}</td>
                    <td className="px-3 py-3 text-end" onClick={(e) => e.stopPropagation()}>{canEdit && <Button variant="ghost" size="icon" aria-label={s.archived_at ? 'Restore' : 'Archive'} onClick={() => toggleArchive(s)}>{s.archived_at ? <ArchiveRestore /> : <Archive />}</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent></Card>

        <div className="space-y-4 lg:col-span-2">
          {sel ? (
            <Card>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div><CardTitle>{sel.name}</CardTitle><CardDescription>{[sel.email, sel.whatsapp && `WhatsApp ${sel.whatsapp}`, sel.payment_terms && `Pays: ${sel.payment_terms}`, sel.certifications].filter(Boolean).join(' · ') || 'No details yet'}</CardDescription></div>
                <Button variant="outline" size="sm" onClick={() => { setEditing(sel); setOpen(true) }}>{canEdit ? 'Edit' : 'Details'}</Button>
              </CardHeader>
              <CardContent>
                {!seesCosts ? <p className="text-sm text-muted-foreground"><T>Supplier prices are visible to managers and finance only.</T></p> : (
                  <>
                    <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium"><T>Quoted prices</T></span><Button variant="outline" size="sm" onClick={() => setPriceOpen(true)}><Plus />Add price</Button></div>
                    {!selPrices.length ? <p className="text-sm text-muted-foreground"><T>No prices recorded.</T></p> : (
                      <ul className="divide-y divide-border text-sm">
                        {selPrices.map((p) => (
                          <li key={p.id} className="flex justify-between gap-2 py-2">
                            <span><span className="font-medium">{pName(p)}</span>{p.packaging && <span className="text-muted-foreground"> · {p.packaging}</span>}<span className="block text-xs text-muted-foreground">{p.valid_from}{p.valid_until ? ` → ${p.valid_until}` : ''}{p.quantity_available ? ` · ${p.quantity_available}` : ''}</span></span>
                            <span className="tabular-nums">{money(p.price, p.currency)} / {p.unit}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ) : <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Select a supplier to see details and prices.</CardContent></Card>}

          {seesCosts && (
            <Card>
              <CardHeader><CardTitle>Compare suppliers</CardTitle><CardDescription>Latest price from each supplier for one product.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Select value={compareProduct} onChange={(e) => setCompareProduct(e.target.value)}><option value="">Choose a product…</option>{products.filter((p) => !p.archived_at && prices.some((x) => x.product_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.product_type})</option>)}</Select>
                {compareProduct && (!comparison.length ? <p className="text-sm text-muted-foreground"><T>No prices for this product.</T></p> : (
                  <ul className="divide-y divide-border text-sm">
                    {comparison.map((p, i) => (
                      <li key={p.id} className="flex justify-between py-2"><span>{i === 0 && <span className="me-1 text-xs font-semibold text-primary"><T>LOWEST</T></span>}{sup[p.supplier_id]?.name}<span className="block text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}{p.valid_until && p.valid_until < new Date().toISOString().slice(0, 10) ? ' · expired' : ''}</span></span><span className="tabular-nums">{money(p.price, p.currency)} / {p.unit}</span></li>
                    ))}
                  </ul>
                ))}
                <p className="text-xs text-muted-foreground"><T>Prices in different currencies or units are not converted.</T></p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <SimpleFormDialog open={open} onOpenChange={setOpen} title={editing ? editing.name : 'Add supplier'} fields={S_FIELDS} readOnly={!canEdit}
        initial={editing ? fromRow(editing, S_FIELDS.map((f) => f.key)) : { country: 'Egypt' }} onSubmit={saveSupplier} />
      <SimpleFormDialog open={priceOpen} onOpenChange={setPriceOpen} title={`New price from ${sel?.name ?? ''}`} description="Prices are kept as history and are never edited." fields={priceFields}
        initial={{ unit: 'kg', currency: 'EGP', valid_from: new Date().toISOString().slice(0, 10) }} onSubmit={savePrice} />
    </>
  )
}
