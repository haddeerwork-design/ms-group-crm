import { useMemo, useState } from 'react'
import { Calculator, Search } from 'lucide-react'
import type { Category, Product } from '@/lib/catalog'
import { INCOTERMS } from '@/lib/pricing'
import { isExpired, money, type PriceListRow } from '@/lib/prices'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/states'

export function PriceList({ rows, products, categories, canCalc, onOpen }: {
  rows: PriceListRow[]; products: Product[]; categories: Category[]
  canCalc: boolean; onOpen: (productId: string, packagingId: string | null, incoterm: string | null) => void
}) {
  const [q, setQ] = useState('')
  const [inc, setInc] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const prod = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])
  const cat = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const priced = new Set(rows.map((r) => r.product_id))
  const unpriced = products.filter((p) => !p.archived_at && !priced.has(p.id))

  const list = rows
    .filter((r) => prod[r.product_id] && !prod[r.product_id].archived_at)
    .filter((r) => !inc || (inc === 'none' ? !r.incoterm : r.incoterm === inc))
    .filter((r) => { const t = q.trim().toLowerCase(); const p = prod[r.product_id]; return !t || p.name.toLowerCase().includes(t) || (r.variety ?? '').toLowerCase().includes(t) || (cat[p.category_id]?.name ?? '').toLowerCase().includes(t) })
    .sort((a, b) => prod[a.product_id].name.localeCompare(prod[b.product_id].name) || String(a.incoterm).localeCompare(String(b.incoterm)))

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search product, variety or category" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-40"><Select value={inc} onChange={(e) => setInc(e.target.value)} aria-label="Incoterm">
          <option value="">All Incoterms</option>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}<option value="none">Not set (imported)</option>
        </Select></div>
        <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4 accent-[#23856B]" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Show products without a price ({unpriced.length})
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
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-3 py-3 font-medium">Packaging</th>
                  <th className="px-3 py-3 font-medium">Terms</th>
                  <th className="px-3 py-3 text-right font-medium">Per ton</th>
                  <th className="px-3 py-3 text-right font-medium">Per kg</th>
                  <th className="px-3 py-3 text-right font-medium">Per carton</th>
                  <th className="px-3 py-3 font-medium">Valid</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const p = prod[r.product_id]
                  const pk = p.product_packaging.find((x) => x.id === r.packaging_id)
                  const expired = isExpired(r)
                  return (
                    <tr key={r.id} className={'border-b border-border last:border-0 ' + (canCalc ? 'cursor-pointer hover:bg-accent/50' : '')}
                      onClick={() => canCalc && onOpen(r.product_id, r.packaging_id, r.incoterm)}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{p.name}{r.variety ? <span className="font-normal text-muted-foreground"> · {r.variety}</span> : null}</div>
                        <div className="text-xs text-muted-foreground">{cat[p.category_id]?.name}</div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{pk?.label ?? (r.net_weight_kg ? `${r.net_weight_kg} kg` : '—')}</td>
                      <td className="px-3 py-3">
                        {r.incoterm ? <span className="font-medium">{r.incoterm}</span> : <Badge className="border-amber-200 bg-amber-50 text-amber-800">Imported — no Incoterm</Badge>}
                        {r.destination && <div className="text-xs text-muted-foreground">{r.destination}</div>}
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">{money(r.price_per_ton, r.sell_currency)}
                        {r.price_basis === 'unit' && r.unit_price ? <div className="text-xs font-normal text-muted-foreground">{money(r.unit_price, r.sell_currency)} / {r.unit_label || 'unit'}</div> : null}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{money(r.price_per_ton / 1000, undefined, 3)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{r.net_weight_kg ? money((r.price_per_ton * r.net_weight_kg) / 1000) : '—'}</td>
                      <td className="px-3 py-3 text-xs">
                        {expired ? <Badge className="border-red-200 bg-red-50 text-red-800">Expired {r.valid_until}</Badge>
                          : <span className="text-muted-foreground">from {r.valid_from}{r.valid_until ? ` to ${r.valid_until}` : ''}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
