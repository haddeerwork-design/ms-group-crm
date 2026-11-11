import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { packOptionLabel, packsFor, type Category, type Product } from '@/lib/catalog'
import { CURRENCIES, INCOTERMS } from '@/lib/pricing'
import type { PriceListRow } from '@/lib/prices'
import { packLabel } from '@/lib/quotations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Per = 'kg' | 'ton' | 'pack'
const today = () => new Date().toISOString().slice(0, 10)
const round2 = (x: number) => Math.round(x * 100) / 100

/** What one price works out to per ton (used everywhere else in the system). */
export function perTon(amount: number, per: Per, packNetKg: number | null) {
  if (per === 'ton') return round2(amount)
  if (per === 'kg') return round2(amount * 1000)
  return packNetKg ? round2((amount / packNetKg) * 1000) : null
}

/** Add or change a selling price quickly. Every save is a new version; the old one stays in the history. */
export function QuickPriceDialog({ open, onOpenChange, row, products, categories, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; row: PriceListRow | null
  products: Product[]; categories: Category[]; onSaved: () => void
}) {
  const { session } = useAuth()
  const [f, setF] = useState({ productId: '', packagingId: '', variety: '', amount: '', currency: 'EGP', per: 'kg' as Per, incoterm: '', destination: '', validUntil: '', notes: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    if (row) {
      const per: Per = row.price_basis === 'unit' ? (row.unit_label === 'kg' ? 'kg' : 'pack') : 'ton'
      setF({ productId: row.product_id, packagingId: row.packaging_id ?? '', variety: row.variety ?? '',
        amount: String(row.price_basis === 'unit' && row.unit_price ? row.unit_price : row.price_per_ton), currency: row.sell_currency, per,
        incoterm: row.incoterm ?? '', destination: row.destination ?? '', validUntil: '', notes: '' })
    } else setF({ productId: '', packagingId: '', variety: '', amount: '', currency: 'EGP', per: 'kg', incoterm: '', destination: '', validUntil: '', notes: '' })
  }, [open, row])

  const product = products.find((p) => p.id === f.productId)
  const packs = product ? packsFor(product, f.variety) : []
  const pk = packs.find((x) => x.id === f.packagingId) ?? null
  const label = packLabel(pk)
  const grouped = useMemo(() => categories.map((c) => ({ c, items: products.filter((p) => p.category_id === c.id && !p.archived_at).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length), [products, categories])
  const amount = Number(f.amount)
  const ton = amount > 0 ? perTon(amount, f.per, pk?.net_weight_kg ?? null) : null

  async function save() {
    if (!product) return toast.error('Choose a product.')
    if (!(amount > 0)) return toast.error('Enter the price.')
    if (f.per === 'pack' && !pk?.net_weight_kg) return toast.error('Choose a packing with a net weight to price per carton.')
    setBusy(true)
    const { error } = await supabase.from('product_prices').insert({
      product_id: product.id, packaging_id: pk?.id ?? null, variety: f.variety.trim() || null,
      incoterm: f.incoterm || null, destination: f.destination.trim() || null,
      net_weight_kg: f.per === 'kg' ? 1 : pk?.net_weight_kg ?? null, cartons_per_pallet: f.per === 'kg' ? null : pk?.cartons_per_pallet ?? null,
      sell_currency: f.currency, price_per_ton: ton,
      price_basis: f.per === 'ton' ? 'ton' : 'unit', unit_price: f.per === 'ton' ? null : amount, unit_label: f.per === 'kg' ? 'kg' : f.per === 'pack' ? label : null,
      valid_from: today(), valid_until: f.validUntil || null, notes: f.notes.trim() || null, source: 'app', created_by: session?.user.id,
    })
    setBusy(false)
    if (error) return toast.error(error.message.includes('row-level') ? 'Your role cannot save prices.' : error.message.includes('price_basis') ? 'Run migration 0013 first.' : error.message)
    toast.success(row ? 'Price updated (old price kept in history)' : 'Price added')
    onSaved(); onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? 'Change selling price' : 'Add selling price'}</DialogTitle>
          <DialogDescription>Saving keeps the old price in the history. For prices built from costs, use the Calculator.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Product" className="sm:col-span-2">
            <Select value={f.productId} disabled={!!row} onChange={(e) => setF({ ...f, productId: e.target.value, packagingId: '', variety: '' })}>
              <option value="">Choose…</option>
              {grouped.map(({ c, items }) => <optgroup key={c.id} label={c.name}>{items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}
            </Select>
          </Field>
          <Field label="Variety (optional)">
            {product && product.varieties.length > 0 ? (
              <Select value={f.variety} onChange={(e) => {
                const v = e.target.value
                // keep the packing only if it fits the variety
                const ok = !f.packagingId || packsFor(product, v).some((x) => x.id === f.packagingId)
                setF({ ...f, variety: v, packagingId: ok ? f.packagingId : '' })
              }}>
                <option value="">All varieties</option>
                {product.varieties.map((v) => <option key={v} value={v}>{v}</option>)}
              </Select>
            ) : <Input value={f.variety} onChange={(e) => setF({ ...f, variety: e.target.value })} placeholder="All varieties" />}
          </Field>
          <Field label="Packing (optional)">
            <Select value={f.packagingId} onChange={(e) => setF({ ...f, packagingId: e.target.value, per: !e.target.value && f.per === 'pack' ? 'kg' : f.per })}>
              <option value="">Any packing</option>
              {packs.map((x) => <option key={x.id} value={x.id}>{packOptionLabel(x)}</option>)}
            </Select>
          </Field>
          <Field label="Price" className="sm:col-span-2" hint={ton && f.per !== 'ton' ? `= ${ton.toLocaleString('en-US')} ${f.currency} per ton` : undefined}>
            <div className="flex gap-1">
              <Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Price" />
              <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} className="w-[88px] shrink-0" aria-label="Currency">
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
              <Select value={f.per} onChange={(e) => setF({ ...f, per: e.target.value as Per })} className="w-[120px] shrink-0" aria-label="Per">
                <option value="kg">per kg</option><option value="ton">per ton</option>
                {pk && <option value="pack">per {label}</option>}
              </Select>
            </div>
          </Field>
          <Field label="Incoterm">
            <Select value={f.incoterm} onChange={(e) => setF({ ...f, incoterm: e.target.value })}>
              <option value="">Not set</option>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}
            </Select>
          </Field>
          <Field label="Destination (optional)"><Input value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} /></Field>
          <Field label="Valid until (optional)"><Input type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
          <Field label="Note (optional)"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save price</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
