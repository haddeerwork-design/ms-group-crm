import { BookOpen, AlertTriangle, Leaf, Package } from 'lucide-react'
import { StatCard } from '@/components/analytics/dash'
import { useT } from '@/lib/i18n'
import { T, TV } from '@/lib/i18n'
import { useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, CalendarDays, Copy, Merge, Table2, FolderCog, List, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { archivedToast } from '@/lib/undo'
import { useAuth } from '@/lib/auth'
import { CATALOG_MANAGERS } from '@/lib/roles'
import {
  activePackaging, AVAILABILITY_LABEL, fetchCatalog, fmt, missingSetup, MONTHS, PRODUCT_TYPE_LABEL,
  seasonLabel, seasonMonths, type Category, type Product,
  productImageUrl,
} from '@/lib/catalog'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Empty, ErrorState, Loading } from '@/components/ui/states'
import { ProductDialog } from '@/components/products/ProductDialog'
import { CategoriesDialog } from '@/components/products/CategoriesDialog'
import { cn } from '@/lib/utils'
import { usePersistentState } from '@/lib/usePersistentState'
import { MobileFilters } from '@/components/ui/mobile-filters'
import { BulkPackaging } from '@/components/products/BulkPackaging'
import { DuplicatesDialog } from '@/components/products/DuplicatesDialog'
import { duplicateGroups } from '@/lib/duplicates'

const TYPE_STYLE = {
  fresh: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900',
  frozen: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900',
  jam: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900',
}

export function Products() {
  const { t: tl } = useT()
  const { hasRole } = useAuth()
  const canEdit = hasRole(...CATALOG_MANAGERS)
  const [data, setData] = useState<{ categories: Category[]; products: Product[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = usePersistentState('products.q', '')
  const [cat, setCat] = usePersistentState('products.cat', '')
  const [avail, setAvail] = usePersistentState('products.avail', '')
  const [setup, setSetup] = usePersistentState('products.setup', '')
  const [showArchived, setShowArchived] = usePersistentState('products.archived', false)
  const [view, setView] = usePersistentState<'list' | 'season' | 'quick'>('products.view', 'list')
  const [editing, setEditing] = useState<Product | null>(null)
  const [dupOf, setDupOf] = useState<Product | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  const [catsOpen, setCatsOpen] = useState(false)

  const load = () => fetchCatalog().then(setData).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const catById = useMemo(() => Object.fromEntries((data?.categories ?? []).map((c) => [c.id, c])), [data])
  const rows = useMemo(() => {
    if (!data) return []
    const term = q.trim().toLowerCase()
    return data.products
      .filter((p) => showArchived ? !!p.archived_at : !p.archived_at)
      .filter((p) => !cat || p.category_id === cat)
      .filter((p) => !avail || (avail === 'unset' ? !p.availability : p.availability === avail))
      .filter((p) => !setup || (setup === 'missing' ? missingSetup(p).length > 0 : missingSetup(p).length === 0))
      .filter((p) => !term || [p.name, ...p.varieties, catById[p.category_id]?.name ?? ''].some((x) => x.toLowerCase().includes(term)))
      .sort((a, b) => (catById[a.category_id]?.sort_order ?? 0) - (catById[b.category_id]?.sort_order ?? 0) || a.name.localeCompare(b.name))
  }, [data, q, cat, avail, setup, showArchived, catById])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    data?.products.forEach((p) => { if (!p.archived_at) c[p.category_id] = (c[p.category_id] ?? 0) + 1 })
    return c
  }, [data])
  const needSetup = data?.products.filter((p) => !p.archived_at && missingSetup(p).length).length ?? 0
  const activeCount = data?.products.filter((p) => !p.archived_at).length ?? 0
  const dupGroups = useMemo(() => duplicateGroups(data?.products ?? []), [data])
  const anyPhoto = useMemo(() => (data?.products ?? []).some((p) => p.image_path), [data])
  const canMerge = hasRole('super_admin', 'sales_manager')

  async function toggleArchive(p: Product) {
    const archiving = !p.archived_at
    const { error, data: d } = await supabase.from('products').update({ archived_at: archiving ? new Date().toISOString() : null }).eq('id', p.id).select('id')
    if (error) return toast.error(error.message.includes('products_name_type_uq') ? 'An active product with the same name already exists.' : error.message)
    if (!d?.length) return toast.error('Your role cannot change products.')
    if (archiving) archivedToast(`“${p.name}”`, 'products', p.id, load); else toast.success('Product restored')
    load()
  }

  const open = (p: Product | null) => { setEditing(p); setDialogOpen(true) }

  return (
    <>
      <PageHeader title="Products"
        summary={data ? tl('{n} products · {m} still need packaging weight or cartons per pallet', { n: activeCount, m: needSetup }) : 'Central product catalog'}
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.open(`${location.pathname}#/catalog/print`, '_blank')} data-tip={tl('Product catalog with photos, ready to print or save as PDF')}><BookOpen />Catalog PDF</Button>
            {canEdit && canMerge && dupGroups.length > 0 && <Button variant="outline" onClick={() => setDupOpen(true)}><Merge /><TV k="Duplicates ({n})" v={{ n: dupGroups.length }} /></Button>}
            {canEdit && <Button variant="outline" onClick={() => setCatsOpen(true)}><FolderCog />Categories</Button>}
            {canEdit && <Button onClick={() => open(null)}><Plus />Add product</Button>}
          </div>
        )} />

      {data && (() => {
        const m = new Date().getMonth() + 1
        const live = data.products.filter((p) => !p.archived_at)
        const inSeasonNow = live.filter((p) => p.season_start_month && p.season_end_month && (p.season_start_month <= p.season_end_month ? m >= p.season_start_month && m <= p.season_end_month : m >= p.season_start_month || m <= p.season_end_month)).length
        return (
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Package} tone="emerald" label="Products" value={live.length} foot="In the catalog" />
            <StatCard icon={AlertTriangle} tone="amber" label="Need setup" value={needSetup} foot="Packing weight or pallet · bar = ready" progress={{ pct: live.length ? ((live.length - needSetup) / live.length) * 100 : null }} />
            <StatCard icon={Leaf} tone="teal" label="In season now" value={inSeasonNow} foot="Season covers this month" />
            <StatCard icon={Merge} tone="violet" label="Possible duplicates" value={dupGroups.length} foot={dupGroups.length ? 'Review them' : 'None found'} />
          </div>
        )
      })()}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-8" placeholder="Search product, variety or category" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <MobileFilters active={[cat, avail, setup].filter(Boolean).length + (showArchived ? 1 : 0)}>
        <div className="w-full sm:w-48"><Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select></div>
        <div className="w-full sm:w-44"><Select value={avail} onChange={(e) => setAvail(e.target.value)} aria-label="Availability">
          <option value="">Any availability</option>
          {Object.entries(AVAILABILITY_LABEL).map(([k, l]) => <option key={k} value={k}><T>{l}</T></option>)}
          <option value="unset">Not set</option>
        </Select></div>
        <div className="w-full sm:w-40"><Select value={setup} onChange={(e) => setSetup(e.target.value)} aria-label="Setup">
          <option value="">Any setup</option><option value="missing">Needs setup</option><option value="ready">Ready</option>
        </Select></div>
        <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4 accent-[#23856B]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Archived
        </label>
        </MobileFilters>
        <div className="ms-auto flex rounded-md border border-border p-0.5">
          <Button variant={view === 'list' ? 'outline' : 'ghost'} size="sm" onClick={() => setView('list')}><List />List</Button>
          <Button variant={view === 'season' ? 'outline' : 'ghost'} size="sm" onClick={() => setView('season')}><CalendarDays />Seasons</Button>
          {canEdit && <Button variant={view === 'quick' ? 'outline' : 'ghost'} size="sm" onClick={() => setView('quick')}><Table2 />Quick edit</Button>}
        </div>
      </div>

      {data && needSetup > 0 && setup !== 'missing' && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" role="status">
          <span className="flex-1">{tl('{n} products still need packaging weight or cartons per pallet. The planner and quotations need these to work out tons.', { n: needSetup })}</span>
          <Button size="sm" variant="outline" onClick={() => setSetup('missing')}>Show them</Button>
          {canEdit && <Button size="sm" onClick={() => { setSetup('missing'); setView('quick') }}>Fill them in</Button>}
        </div>
      )}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {error ? <div className="p-5"><ErrorState message={error} /></div>
            : !data ? <Loading />
            : !rows.length ? <div className="p-5"><Empty title="No products match" hint={data.products.length ? 'No product fits these filters.' : 'Run migration 0002 in Supabase first.'}
              action={data.products.length > 0 && <Button variant="outline" onClick={() => { setQ(''); setCat(''); setAvail(''); setSetup(''); setShowArchived(false) }}>Clear filters</Button>} /></div>
            : view === 'list' ? (
              <>
              <ul className="divide-y divide-border md:hidden">
                {rows.map((p) => {
                  const pk = activePackaging(p)[0]
                  const miss = missingSetup(p)
                  return (
                    <li key={p.id} className="flex items-start gap-2 px-4 py-3">
                      {anyPhoto && <Thumb path={p.image_path} />}
                      <button type="button" className="min-w-0 flex-1 text-start" onClick={() => open(p)}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          <span className={cn('rounded-full border px-1.5 py-px text-[10px] font-medium', TYPE_STYLE[p.product_type])}><T>{PRODUCT_TYPE_LABEL[p.product_type]}</T></span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{catById[p.category_id]?.name}{pk ? ` · ${pk.label}` : ''}{seasonLabel(p) ? ` · ${seasonLabel(p)}` : ''}</div>
                        {miss.length > 0 && <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-amber-500" />{setup === 'missing' ? `Missing ${miss.join(', ')}` : 'Needs setup'}</div>}
                      </button>
                      {canEdit && !p.archived_at && <Button variant="ghost" size="icon" onClick={() => { setEditing(null); setDupOf(p); setDialogOpen(true) }} aria-label={`Duplicate ${p.name}`}><Copy /></Button>}
                      {canEdit && <Button variant="ghost" size="icon" onClick={() => toggleArchive(p)} aria-label={p.archived_at ? 'Restore' : 'Archive'}>{p.archived_at ? <ArchiveRestore /> : <Archive />}</Button>}
                    </li>
                  )
                })}
              </ul>
              <table className="hidden w-full min-w-[760px] text-sm md:table">
                <thead>
                  <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-medium"><T>Product</T></th>
                    <th className="px-3 py-3 font-medium"><T>Category</T></th>
                    <th className="px-3 py-3 font-medium"><T>Default packaging</T></th>
                    <th className="px-3 py-3 font-medium"><T>Season</T></th>
                    <th className="px-3 py-3 font-medium"><T>Availability</T></th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const pk = activePackaging(p)[0]
                    const miss = missingSetup(p)
                    return (
                      <tr key={p.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50" onClick={() => open(p)}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {anyPhoto && <Thumb path={p.image_path} />}
                            <span className="font-medium">{p.name}</span>
                            <span className={cn('rounded-full border px-1.5 py-px text-[10px] font-medium', TYPE_STYLE[p.product_type])}><T>{PRODUCT_TYPE_LABEL[p.product_type]}</T></span>
                          </div>
                          {p.varieties.length > 0 && <div className="text-xs text-muted-foreground">{p.varieties.join(' · ')}</div>}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{catById[p.category_id]?.name}</td>
                        <td className="px-3 py-3">
                          {pk ? (
                            <>
                              <div>{pk.label}{activePackaging(p).length > 1 && <span className="text-xs text-muted-foreground"> +{activePackaging(p).length - 1} more</span>}</div>
                              <div className="text-xs text-muted-foreground">
                                {fmt(pk.net_weight_kg)} kg net · {pk.cartons_per_pallet ?? '—'} / pallet
                                {pk.net_weight_kg && pk.cartons_per_pallet ? ` · ${fmt(pk.net_weight_kg * pk.cartons_per_pallet, 0)} kg/pallet` : ''}
                              </div>
                            </>
                          ) : null}
                          {miss.length > 0 && (setup === 'missing'
                            ? <Badge className={cn(pk && 'mt-1', 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200')}>Missing {miss.join(', ')}</Badge>
                            : <span className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', pk && 'mt-0.5')} title={`Missing ${miss.join(', ')}`}><span className="size-1.5 rounded-full bg-amber-500" /><T>Needs setup</T></span>)}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{seasonLabel(p) ?? '—'}</td>
                        <td className="px-3 py-3 text-muted-foreground">{p.availability ? AVAILABILITY_LABEL[p.availability] : '—'}</td>
                        <td className="px-3 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                          {canEdit && !p.archived_at && (
                            <Button variant="ghost" size="icon" onClick={() => { setEditing(null); setDupOf(p); setDialogOpen(true) }} title="Duplicate" aria-label={`Duplicate ${p.name}`}>
                              <Copy />
                            </Button>
                          )}
                          {canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => toggleArchive(p)} title={p.archived_at ? 'Restore' : 'Archive'} aria-label={p.archived_at ? 'Restore' : 'Archive'}>
                              {p.archived_at ? <ArchiveRestore /> : <Archive />}
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </>
            ) : view === 'quick' ? (
              <BulkPackaging rows={rows.filter((p) => !p.archived_at)} onSaved={load} />
            ) : (
              <SeasonCalendar rows={rows} onOpen={open} />
            )}
        </CardContent>
      </Card>

      {data && (
        <>
          <ProductDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setDupOf(null) }} product={editing} duplicateOf={dupOf} categories={data.categories} canEdit={canEdit} onSaved={load} />
          {data && <DuplicatesDialog open={dupOpen} onOpenChange={setDupOpen} groups={dupGroups} categories={data.categories} onMerged={() => { load() }} />}
      <CategoriesDialog open={catsOpen} onOpenChange={setCatsOpen} categories={data.categories} counts={counts} onSaved={load} />
        </>
      )}
    </>
  )
}

function SeasonCalendar({ rows, onOpen }: { rows: Product[]; onOpen: (p: Product) => void }) {
  const now = new Date().getMonth() + 1
  const withSeason = rows.filter((p) => p.season_start_month)
  const without = rows.length - withSeason.length
  return (
    <div className="p-4">
      {!withSeason.length ? <Empty title="No seasons entered yet" hint="Open a product and set “Season starts” and “Season ends”." /> : (
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-2 pe-3 text-start font-medium"><T>Product</T></th>
              {MONTHS.map((m, i) => <th key={m} className={cn('w-[6.5%] py-2 text-center font-medium', i + 1 === now && 'text-foreground')}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {withSeason.map((p) => {
              const months = seasonMonths(p.season_start_month, p.season_end_month)
              return (
                <tr key={p.id} className="cursor-pointer hover:bg-accent/50" onClick={() => onOpen(p)}>
                  <td className="py-1.5 pe-3">{p.name} <span className="text-xs text-muted-foreground"><T>{PRODUCT_TYPE_LABEL[p.product_type]}</T></span></td>
                  {MONTHS.map((m, i) => (
                    <td key={m} className="px-0.5 py-1.5">
                      <div className={cn('h-5 rounded-sm', months.has(i + 1) ? 'bg-primary/80' : 'bg-muted', i + 1 === now && 'ring-1 ring-foreground/30')} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {without > 0 && withSeason.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{without} products have no season set and are not shown.</p>}
    </div>
  )
}

function Thumb({ path }: { path?: string | null }) {
  const src = productImageUrl(path)
  return src ? <img src={src} alt="" loading="lazy" className="size-9 shrink-0 rounded-lg border border-border object-cover" />
    : <span className="size-9 shrink-0 rounded-lg border border-dashed border-border bg-muted/40" aria-hidden />
}
