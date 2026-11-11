import { useState } from 'react'
import { Archive, ArchiveRestore, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PRODUCT_TYPE_LABEL, type Category, type ProductType } from '@/lib/catalog'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

export function CategoriesDialog({ open, onOpenChange, categories, counts, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; categories: Category[]
  counts: Record<string, number>; onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ProductType>('fresh')
  const [busy, setBusy] = useState<string | null>(null)

  async function run(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(key)
    const { error } = await fn()
    setBusy(null)
    if (error) return toast.error(error.message.includes('name_uq') ? 'That category already exists.' : error.message)
    toast.success(ok); onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Product categories</DialogTitle>
          <DialogDescription>Rename by editing the name and clicking outside. Archived categories are hidden from new products.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => {
            e.preventDefault()
            if (name.trim().length < 2) return toast.error('Enter a category name')
            const max = Math.max(0, ...categories.map((c) => c.sort_order))
            run('new', () => supabase.from('product_categories').insert({ name: name.trim(), product_type: type, sort_order: max + 10 }), 'Category added')
              .then(() => setName(''))
          }}>
            <Input className="min-w-40 flex-1" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="w-32"><Select value={type} onChange={(e) => setType(e.target.value as ProductType)}>
              {Object.entries(PRODUCT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select></div>
            <Button type="submit" disabled={busy === 'new'}>{busy === 'new' ? <Loader2 className="animate-spin" /> : <Plus />}Add</Button>
          </form>
          <ul className="divide-y divide-border rounded-md border border-border">
            {categories.map((c) => (
              <li key={c.id} className={'flex items-center gap-2 p-2 ' + (c.archived_at ? 'opacity-60' : '')}>
                <Input defaultValue={c.name} className="h-8 flex-1" aria-label="Category name"
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== c.name) run(c.id, () => supabase.from('product_categories').update({ name: v }).eq('id', c.id), 'Category renamed')
                  }} />
                <span className="w-16 text-xs text-muted-foreground">{PRODUCT_TYPE_LABEL[c.product_type]}</span>
                <span className="w-20 text-end text-xs text-muted-foreground">{counts[c.id] ?? 0} products</span>
                <Button variant="ghost" size="icon" disabled={busy === c.id}
                  title={c.archived_at ? 'Restore' : 'Archive'} aria-label={c.archived_at ? 'Restore' : 'Archive'}
                  onClick={() => run(c.id, () => supabase.from('product_categories').update({ archived_at: c.archived_at ? null : new Date().toISOString() }).eq('id', c.id),
                    c.archived_at ? 'Category restored' : 'Category archived')}>
                  {c.archived_at ? <ArchiveRestore /> : <Archive />}
                </Button>
              </li>
            ))}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
