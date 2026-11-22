import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Languages, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { arabicProductName } from '@/lib/productNamesAr'
import type { Product } from '@/lib/catalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Arabic names for every product that has none: the app writes them from the
 * English name, the person checks them in one list and saves them all at once.
 */
export function ArabicNamesDialog({ open, onOpenChange, products, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; products: Product[]; onSaved: () => void
}) {
  const { t } = useT()
  const missing = useMemo(() => products.filter((p) => !p.archived_at && !p.name_ar?.trim()).sort((a, b) => a.name.localeCompare(b.name)), [products])
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setVals(Object.fromEntries(missing.map((p) => [p.id, arabicProductName(p.name) ?? '']))) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const ready = missing.filter((p) => vals[p.id]?.trim())
  const unknown = missing.length - missing.filter((p) => arabicProductName(p.name)).length

  async function save() {
    setBusy(true)
    const res = await Promise.all(ready.map((p) => supabase.from('products').update({ name_ar: vals[p.id].trim().slice(0, 120) }).eq('id', p.id).select('id')))
    setBusy(false)
    const bad = res.filter((r) => r.error || !r.data?.length)
    if (bad.length) toast.error(bad[0].error?.message ?? t('Your role cannot change products.'))
    if (bad.length < res.length) toast.success(t('Arabic names saved for {n} products', { n: res.length - bad.length }))
    onSaved(); onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Arabic names')}</DialogTitle>
          <DialogDescription>{t('The app wrote an Arabic name for each product from its English name. Check them, change any you like, then save.')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {!missing.length ? <p className="py-6 text-center text-sm text-muted-foreground">{t('Every product already has an Arabic name.')}</p> : (
            <>
              {unknown > 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">{t('{n} names could not be written automatically: type them, or leave them empty for now.', { n: unknown })}</p>}
              <ul className="divide-y divide-border">
                {missing.map((p) => (
                  <li key={p.id} className="grid grid-cols-2 items-center gap-3 py-2">
                    <span className="truncate text-sm" dir="ltr">{p.name}</span>
                    <Input dir="rtl" lang="ar" value={vals[p.id] ?? ''} placeholder={t('Type the Arabic name')} aria-label={t('Arabic name of {p}', { p: p.name })}
                      onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} className={!vals[p.id]?.trim() ? 'border-amber-400' : ''} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={busy || !ready.length}>{busy ? <Loader2 className="animate-spin" /> : <Languages />}{t('Save {n} names', { n: ready.length })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
