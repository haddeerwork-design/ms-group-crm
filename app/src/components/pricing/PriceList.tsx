import { T, TV, tr, useT } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { AlertTriangle, Archive, Calculator, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { archivedToast } from '@/lib/undo'
import { QuickPriceDialog } from './QuickPriceDialog'
import type { Category, Product } from '@/lib/catalog'
import { INCOTERMS } from '@/lib/pricing'
import { EXPIRING_DAYS, money, OLD_PRICE_DAYS, priceHealth, priceHealthSummary, removePriceLine, restorePrices, type PriceListRow } from '@/lib/prices'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/states'

export function PriceList({ rows, products, categories, canCalc, canEdit, onOpen, onSaved }: {
  rows: PriceListRow[]; products: Product[]; categories: Category[]
  canCalc: boolean; canEdit: boolean; onOpen: (productId: string, packagingId: string | null, incoterm: string | null) => void; onSaved: () => void
}) {
  const { t: tl } = useT()
  const [editing, setEditing] = useState<PriceListRow | 'new' | null>(null)
  const [q, setQ] = useState('')
  const [inc, setInc] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [attention, setAttention] = useState(false)
  const prod = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])
  const cat = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const priced = new Set(rows.map((r) => r.product_id))
  const unpriced = products.filter((p) => !p.archived_at && !priced.has(p.id))

  const list = rows
    .filter((r) => prod[r.product_id] && !prod[r.product_id].archived_at)
    .filter((r) => !inc || (inc === 'none' ? !r.incoterm : r.incoterm === inc))
    .filter((r) => !attention || priceHealth(r).state !== 'ok')
    .filter((r) => { const t = q.trim().toLowerCase(); const p = prod[r.product_id]; return !t || p.name.toLowerCase().includes(t) || (r.variety ?? '').toLowerCase().includes(t) || (cat[p.category_id]?.name ?? '').toLowerCase().includes(t) })
    .sort((a, b) => prod[a.product_id].name.localeCompare(prod[b.product_id].name) || (a.variety ?? '').localeCompare(b.variety ?? '') || String(a.packaging_id).localeCompare(String(b.packaging_id)))

  /** Remove one price line (all its versions). Old quotations keep working; Undo brings it back. */
  async function removePrice(r: PriceListRow) {
    const p = prod[r.product_id]
    const what = [p.name, r.variety, p.product_packaging.find((x) => x.id === r.packaging_id)?.label].filter(Boolean).join(' · ')
    try {
      const ids = await removePriceLine(r)
      onSaved()
      toast.success(tr('Price removed: {what}', { what }), {
        duration: 8000,
        action: { label: tr('Undo'), onClick: async () => { try { await restorePrices(ids); toast.success('Price restored'); onSaved() } catch (e) { toast.error((e as Error).message) } } },
      })
    } catch (e) { toast.error(tr((e as Error).message)) }
  }
  /** Remove a product with all its prices: it goes to the Archive (can be restored). */
  async function removeProduct(productId: string) {
    const p = prod[productId]
    const { error, data } = await supabase.from('products').update({ archived_at: new Date().toISOString() }).eq('id', productId).select('id')
    if (error || !data?.length) return toast.error(error?.message ?? 'Your role cannot change products.')
    archivedToast(`“${p.name}”`, 'products', p.id, onSaved)
    onSaved()
  }

  const health = priceHealthSummary(rows.filter((r) => prod[r.product_id] && !prod[r.product_id].archived_at))

  return (
    <>
      {health.total > 0 && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="font-medium"><TV k="{n} prices need a look" v={{ n: health.total }} /></span>
            {' · '}{[
              health.expired ? <TV key="e" k="{n} expired" v={{ n: health.expired }} /> : null,
              health.expiring ? <TV key="s" k="{n} end within {d} days" v={{ n: health.expiring, d: EXPIRING_DAYS }} /> : null,
              health.old ? <TV key="o" k="{n} not updated for {d}+ days" v={{ n: health.old, d: OLD_PRICE_DAYS }} /> : null,
            ].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]))}
          </span>
          <Button size="sm" variant="outline" className="bg-card" onClick={() => { setAttention(!attention); setOnlyMissing(false) }}>{attention ? 'Show all prices' : 'Show them'}</Button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-8" placeholder="Search product, variety or category" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-40"><Select value={inc} onChange={(e) => setInc(e.target.value)} aria-label="Incoterm">
          <option value="">All Incoterms</option>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}<option value="none">Not set (imported)</option>
        </Select></div>
        {canEdit && <Button onClick={() => setEditing('new')}><Plus />Add price</Button>}
        <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4 accent-[#23856B]" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          <TV k="Show products without a price ({n})" v={{ n: unpriced.length }} />
        </label>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {onlyMissing ? (
            !unpriced.length ? <div className="p-5"><Empty title="Every product has a price" /></div> : (
              <ul className="divide-y divide-border">
                {unpriced.sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span>{p.name} <span className="text-muted-foreground">· {cat[p.category_id]?.name}</span></span>
                    {canCalc && <Button variant="outline" size="sm" onClick={() => onOpen(p.id, null, null)}><Calculator />Price it</Button>}
                  </li>
                ))}
              </ul>
            )
          ) : !list.length ? <div className="p-5"><Empty title="No prices yet" hint={canCalc ? 'Open the calculator, choose a product and save a price.' : 'Prices appear here once the Sales Manager saves them.'} /></div> : (
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium"><T>Product</T></th>
                  <th className="px-3 py-3 font-medium"><T>Packaging</T></th>
                  <th className="px-3 py-3 font-medium"><T>Terms</T></th>
                  <th className="px-3 py-3 text-end font-medium"><T>Per ton</T></th>
                  <th className="px-3 py-3 text-end font-medium"><T>Per kg</T></th>
                  <th className="px-3 py-3 text-end font-medium"><T>Per carton</T></th>
                  <th className="px-3 py-3 font-medium"><T>Valid</T></th>
                  {(canEdit || canCalc) && <th className="px-3 py-3" />}
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const p = prod[r.product_id]
                  const sameAsAbove = i > 0 && list[i - 1].product_id === r.product_id
                  const pk = p.product_packaging.find((x) => x.id === r.packaging_id)
                  const h = priceHealth(r)
                  return (
                    <tr key={r.id} className={'group border-border last:border-0 ' + (i + 1 < list.length && list[i + 1].product_id === r.product_id ? '' : 'border-b ') + (canEdit ? 'cursor-pointer hover:bg-accent/50' : '')}
                      onClick={() => canEdit && setEditing(r)}>
                      <td className="px-5 py-3">
                        {/* the product name once; its varieties / packings listed under it */}
                        {!sameAsAbove && <div className="flex items-center gap-1 font-medium">{p.name}
                          {canEdit && <button type="button" onClick={(e) => { e.stopPropagation(); removeProduct(p.id) }} aria-label={tl('Remove product')}
                            data-tip={tl('Remove the product and all its prices (it goes to the Archive)')} data-tip-up
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                            <Archive className="size-3.5" /></button>}
                        </div>}
                        {r.variety ? <div className={sameAsAbove ? 'ps-3 text-sm' : 'text-sm'}>{r.variety}</div> : sameAsAbove ? <div className="ps-3 text-sm text-muted-foreground"><T>All varieties</T></div> : null}
                        {!sameAsAbove && <div className="text-xs text-muted-foreground">{cat[p.category_id]?.name}</div>}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{pk?.label ?? (r.price_basis === 'unit' && r.unit_label === 'kg' ? <T>Any packing (price per kg)</T> : <T>Any packing</T>)}</td>
                      <td className="px-3 py-3">
                        {r.incoterm ? <span className="font-medium">{r.incoterm}</span> : r.source === 'imported' ? <Badge className="border-amber-200 bg-amber-50 text-amber-800">Old CRM price</Badge> : <span className="text-muted-foreground"><T>No Incoterm</T></span>}
                        {r.destination && <div className="text-xs text-muted-foreground">{r.destination}</div>}
                      </td>
                      <td className="px-3 py-3 text-end font-medium tabular-nums">{money(r.price_per_ton, r.sell_currency)}
                        {r.price_basis === 'unit' && r.unit_price ? <div className="text-xs font-normal text-muted-foreground">{money(r.unit_price, r.sell_currency)} / {r.unit_label || 'unit'}</div> : null}</td>
                      <td className="px-3 py-3 text-end tabular-nums text-muted-foreground">{money(r.price_per_ton / 1000, undefined, 3)}</td>
                      <td className="px-3 py-3 text-end tabular-nums text-muted-foreground">{r.net_weight_kg && r.unit_label !== 'kg' ? money((r.price_per_ton * r.net_weight_kg) / 1000) : '—'}</td>
                      <td className="px-3 py-3 text-xs">
                        {h.state === 'expired' ? <Badge className="border-red-200 bg-red-50 text-red-800">{tl('Expired {date}', { date: r.valid_until ?? '' })}</Badge>
                          : <span className="text-muted-foreground">{tl('from {date}', { date: r.valid_from })}{r.valid_until ? ` ${tl('to {date}', { date: r.valid_until })}` : ''}</span>}
                        {h.state === 'expiring' && <div><Badge className="mt-1 border-amber-200 bg-amber-50 text-amber-800">{h.days === 0 ? tl('Ends today') : tl('Ends in {n} days', { n: h.days })}</Badge></div>}
                        {h.state === 'old' && <div><Badge className="mt-1 border-amber-200 bg-amber-50 text-amber-800">{tl('Not updated for {n} days', { n: h.days })}</Badge></div>}
                      </td>
                      {(canEdit || canCalc) && (
                        <td className="whitespace-nowrap px-3 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                          {canEdit && <Button variant="ghost" size="sm" onClick={() => setEditing(r)}><Pencil />Edit</Button>}
                          {canCalc && <Button variant="ghost" size="icon" data-tip={tl('Open in the calculator')} data-tip-up aria-label={tl('Open in the calculator')} onClick={() => onOpen(r.product_id, r.packaging_id, r.incoterm)}><Calculator /></Button>}
                          {canEdit && <Button variant="ghost" size="icon" data-tip={tl('Remove this price')} data-tip-end data-tip-up aria-label={tl('Remove this price')} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => removePrice(r)}><Trash2 /></Button>}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <QuickPriceDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} row={editing === 'new' ? null : editing}
        products={products} categories={categories} onSaved={onSaved} />
    </>
  )
}
