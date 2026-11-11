import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Merge } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { activePackaging, PRODUCT_TYPE_LABEL, type Category, type Product } from '@/lib/catalog'
import { suggestKeep } from '@/lib/duplicates'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { T, TV, tr } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Review products that look the same and merge each group into one (nothing is deleted). */
export function DuplicatesDialog({ open, onOpenChange, groups, categories, onMerged }: {
  open: boolean; onOpenChange: (o: boolean) => void; groups: Product[][]; categories: Category[]; onMerged: () => void
}) {
  const cat = Object.fromEntries(categories.map((c) => [c.id, c.name]))
  const [keep, setKeep] = useState<Record<number, string>>({})
  const [skip, setSkip] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => { if (open) { setKeep(Object.fromEntries(groups.map((g, i) => [i, suggestKeep(g).id]))); setSkip({}) } }, [open, groups])

  async function merge(i: number) {
    const g = groups[i]; const k = keep[i]
    const others = g.filter((p) => p.id !== k && !skip[p.id]).map((p) => p.id)
    if (!others.length) return toast.error(tr('Tick at least one product to merge.'))
    const kept = g.find((p) => p.id === k)!
    if (!window.confirm(tr('Merge {n} product(s) into “{name}”? Their packing, prices and history move to it, and they are archived (not deleted).', { n: others.length, name: kept.name }))) return
    setBusy(i)
    const { error } = await supabase.rpc('merge_products', { keep: k, others })
    setBusy(null)
    if (error) return toast.error(/merge_products|function/i.test(error.message) && /not find|does not exist/i.test(error.message) ? tr('Run migration 0017 in Supabase first.') : error.message)
    toast.success(tr('Merged into “{name}”', { name: kept.name }))
    onMerged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Possible duplicate products</DialogTitle>
          <DialogDescription>Products of the same type whose names mean the same thing. Choose the one to keep; the others move into it and are archived. Nothing is deleted.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!groups.length && <p className="py-6 text-center text-sm text-muted-foreground"><T>No duplicates found.</T></p>}
          {groups.map((g, i) => (
            <section key={g.map((p) => p.id).join()} className="rounded-xl border border-border">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <span className="text-sm font-semibold">{g[0].name} <span className="font-normal text-muted-foreground">· <T>{PRODUCT_TYPE_LABEL[g[0].product_type]}</T> · <TV k="{n} products" v={{ n: g.length }} /></span></span>
                <Button size="sm" onClick={() => merge(i)} disabled={busy !== null}>{busy === i ? <Loader2 className="animate-spin" /> : <Merge />}Merge</Button>
              </div>
              <ul className="divide-y divide-border">
                {g.map((p) => {
                  const isKeep = keep[i] === p.id
                  const pk = activePackaging(p)
                  return (
                    <li key={p.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm', isKeep && 'bg-emerald-50/60 dark:bg-emerald-950/40')}>
                      <label className="flex items-center gap-2">
                        <input type="radio" name={`keep-${i}`} className="size-4 accent-[#23856B]" checked={isKeep} onChange={() => setKeep({ ...keep, [i]: p.id })} />
                        <span className={cn('text-xs font-medium', isKeep ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}><T>{isKeep ? 'Keep' : 'Merge into kept'}</T></span>
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {cat[p.category_id]} · <TV k="{n} packing" v={{ n: pk.length }} />{p.varieties.length ? ` · ${p.varieties.join(', ')}` : ''}
                        </div>
                      </div>
                      {!isKeep && (
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input type="checkbox" className="size-4 accent-[#23856B]" checked={!skip[p.id]} onChange={(e) => setSkip({ ...skip, [p.id]: !e.target.checked })} />
                          <T>Include</T>
                        </label>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
