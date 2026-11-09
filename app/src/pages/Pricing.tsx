import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { COST_VIEWERS } from '@/lib/roles'
import { fetchCatalog, type Category, type Product } from '@/lib/catalog'
import { fetchLatestRates, fetchPriceList, type PriceListRow, type SavedRate } from '@/lib/prices'
import { PageHeader } from '@/components/layout/AppShell'
import { ErrorState, Loading } from '@/components/ui/states'
import { PriceList } from '@/components/pricing/PriceList'
import { PriceCalculator } from '@/components/pricing/Calculator'
import { ExchangeRates } from '@/components/pricing/ExchangeRates'
import { cn } from '@/lib/utils'

type Tab = 'list' | 'calc' | 'fx'

export function Pricing() {
  const { hasRole } = useAuth()
  const seesCosts = hasRole(...COST_VIEWERS)
  const [tab, setTab] = useState<Tab>('list')
  const [data, setData] = useState<{ products: Product[]; categories: Category[]; list: PriceListRow[]; rates: SavedRate[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [initial, setInitial] = useState<{ productId: string; packagingId: string | null; incoterm: string | null } | null>(null)

  const load = useCallback(() => Promise.all([fetchCatalog(), fetchPriceList(), fetchLatestRates()])
    .then(([c, list, rates]) => setData({ ...c, list, rates })).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const tabs: { k: Tab; label: string; show: boolean }[] = [
    { k: 'list', label: 'Price list', show: true },
    { k: 'calc', label: 'Calculator', show: seesCosts },
    { k: 'fx', label: 'Exchange rates', show: true },
  ]

  return (
    <>
      <PageHeader title="Pricing" summary={seesCosts
        ? 'Build export prices from costs, keep every version, and track the exchange rates used.'
        : 'Current selling prices approved by the Sales Manager.'} />
      <div className="mb-5 flex gap-1 border-b border-border">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors', tab === t.k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>
      {error ? <ErrorState message={error} /> : !data ? <Loading /> : (
        <>
          {tab === 'list' && <PriceList rows={data.list} products={data.products} categories={data.categories} canCalc={seesCosts}
            onOpen={(productId, packagingId, incoterm) => { setInitial({ productId, packagingId, incoterm }); setTab('calc') }} />}
          {tab === 'calc' && seesCosts && <PriceCalculator products={data.products} categories={data.categories} rates={data.rates} initial={initial} onSaved={load} />}
          {tab === 'fx' && <ExchangeRates onChanged={load} />}
        </>
      )}
    </>
  )
}
