import { ExternalLink, Plus } from 'lucide-react'
import { importerSearches } from '@/lib/trade'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { T } from '@/lib/i18n'

/** Ready-made searches for importers of a product in a country. Opens each site in a new tab. */
export function FindImporters({ product, country, setProduct, setCountry, products, countries, onAdd }: {
  product: string; country: string; setProduct: (v: string) => void; setCountry: (v: string) => void
  products: string[]; countries: string[]; onAdd: () => void
}) {
  const links = importerSearches(product, country)
  const ready = product.trim().length > 1
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Find importers</CardTitle>
          <CardDescription>Type a product and a country, then open the searches below. When you find a real company, add it with the link where you found it.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Product">
            <Input list="fi-products" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Mango" />
            <datalist id="fi-products">{products.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Country (optional)">
            <Input list="fi-countries" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. United Arab Emirates" />
            <datalist id="fi-countries">{countries.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Button onClick={onAdd}><Plus />Add a company you found</Button>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <a key={l.key} href={ready ? l.url : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!ready}
            className={'group flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.04)] transition-colors ' + (ready ? 'hover:border-primary/40' : 'pointer-events-none opacity-50')}>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{l.name}</div>
              <div className="text-sm text-muted-foreground"><T>{l.what}</T></div>
            </div>
            <ExternalLink className="size-4 shrink-0 text-muted-foreground group-hover:text-primary rtl:-scale-x-100" />
          </a>
        ))}
      </div>
      <p className="text-xs text-muted-foreground"><T>These sites are outside the system. Check each company yourself before adding it; only add companies with a real source link.</T></p>
    </div>
  )
}
