import { T } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { activePackaging, missingSetup, type Product } from '@/lib/catalog'
import { Button } from '@/components/ui/button'
import { StickyActions } from '@/components/ui/sticky-actions'
import { useLeaveGuard } from '@/lib/useLeaveGuard'
import { cn } from '@/lib/utils'

// Spreadsheet-style editing of each product's DEFAULT packaging.
// Enter / ↓ moves down the same column, ↑ moves up. Only changed rows are saved.
const COLS = [
  { k: 'label', label: 'Packaging', w: 'w-48', num: false, ph: 'e.g. Carton 4 kg' },
  { k: 'packaging_type', label: 'Type', w: 'w-28', num: false, ph: 'Carton' },
  { k: 'net_weight_kg', label: 'Net kg', w: 'w-24', num: true, ph: '' },
  { k: 'gross_weight_kg', label: 'Gross kg', w: 'w-24', num: true, ph: '' },
  { k: 'cartons_per_pallet', label: 'Cartons / pallet', w: 'w-28', num: true, ph: '' },
] as const
type Key = (typeof COLS)[number]['k']
type Row = Record<Key, string>

const toRow = (p: Product): Row => {
  const pk = activePackaging(p)[0]
  return {
    label: pk?.label ?? '', packaging_type: pk?.packaging_type ?? '',
    net_weight_kg: pk?.net_weight_kg?.toString() ?? '', gross_weight_kg: pk?.gross_weight_kg?.toString() ?? '',
    cartons_per_pallet: pk?.cartons_per_pallet?.toString() ?? '',
  }
}
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

export function BulkPackaging({ rows, onSaved }: { rows: Product[]; onSaved: () => void }) {
  const initial = useMemo(() => Object.fromEntries(rows.map((p) => [p.id, toRow(p)])), [rows])
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({})
  const [busy, setBusy] = useState(false)
  const val = (id: string, k: Key) => edits[id]?.[k] ?? initial[id]?.[k] ?? ''
  const changed = Object.keys(edits).filter((id) => COLS.some((c) => (edits[id][c.k] ?? initial[id][c.k]) !== initial[id][c.k]))
  const bad = (id: string, k: Key) => {
    const v = val(id, k); if (!COLS.find((c) => c.k === k)!.num || !v.trim()) return false
    const n = num(v); return n == null || !isFinite(n) || n <= 0 || (k === 'cartons_per_pallet' && !Number.isInteger(n))
  }
  const errors = changed.filter((id) => COLS.some((c) => bad(id, c.k)) || (!val(id, 'label').trim() && COLS.some((c) => c.k !== 'label' && val(id, c.k).trim())))

  function move(e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    const go = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!go) return
    e.preventDefault()
    document.querySelector<HTMLInputElement>(`[data-cell="${r + go}-${c}"]`)?.focus()
  }

  async function save() {
    if (!changed.length || busy) return
    if (errors.length) { toast.error('Fix the cells in red first (numbers above 0; cartons per pallet a whole number; packaging name needed).'); return }
    setBusy(true)
    let ok = 0; const fail: string[] = []
    for (const id of changed) {
      const p = rows.find((x) => x.id === id)!
      const pk = activePackaging(p)[0]
      const r = { ...initial[id], ...edits[id] }
      const row = {
        label: r.label.trim(), packaging_type: r.packaging_type.trim() || null,
        net_weight_kg: num(r.net_weight_kg), gross_weight_kg: num(r.gross_weight_kg), cartons_per_pallet: num(r.cartons_per_pallet),
      }
      const res = pk
        ? await supabase.from('product_packaging').update(row).eq('id', pk.id).select('id')
        : await supabase.from('product_packaging').insert({ ...row, product_id: id, is_default: true }).select('id')
      if (res.error || !res.data?.length) fail.push(p.name); else ok++
    }
    setBusy(false)
    if (fail.length) toast.error(`Not saved: ${fail.join(', ')}. Your role may not edit products.`)
    if (ok) { toast.success(`${ok} product${ok > 1 ? 's' : ''} updated`); setEdits({}); onSaved() }
  }
  useLeaveGuard(changed.length > 0, save)

  return (
    <>
      <p className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
        Type like in Excel: <kbd className="rounded border px-1 text-xs">Enter</kbd> goes to the next row. Edits the default packaging of each product. Changed cells turn green; save once at the end.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-medium"><T>Product</T></th>
              {COLS.map((c) => <th key={c.k} className={cn('px-1.5 py-2.5 font-medium', c.num && 'text-end')}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, ri) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-5 py-1.5">
                  <div className="font-medium">{p.name}</div>
                  {missingSetup(p).length > 0 && <div className="text-xs text-amber-700 dark:text-amber-300">Missing {missingSetup(p).join(', ')}</div>}
                </td>
                {COLS.map((c, ci) => {
                  const v = val(p.id, c.k); const dirty = v !== initial[p.id][c.k]
                  return (
                    <td key={c.k} className="px-1.5 py-1.5">
                      <input data-cell={`${ri}-${ci}`} value={v} placeholder={c.ph} inputMode={c.num ? 'decimal' : undefined}
                        aria-label={`${c.label} for ${p.name}`} aria-invalid={bad(p.id, c.k) || undefined}
                        onKeyDown={(e) => move(e, ri, ci)}
                        onChange={(e) => setEdits((x) => ({ ...x, [p.id]: { ...x[p.id], [c.k]: e.target.value } }))}
                        className={cn('h-8 rounded-md border border-transparent bg-muted/40 px-2 outline-none transition-colors hover:border-border focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20',
                          c.w, c.num && 'text-end tabular-nums', dirty && 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950',
                          bad(p.id, c.k) && 'border-destructive bg-destructive/5')} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StickyActions dirty={changed.length > 0} className="mx-0 rounded-b-xl md:mx-0"
        info={changed.length > 0 && <span className="text-muted-foreground">{changed.length} product{changed.length > 1 ? 's' : ''} changed{errors.length ? <span className="text-destructive"> · {errors.length} with errors</span> : ''}</span>}>
        <Button variant="ghost" onClick={() => setEdits({})} disabled={!changed.length || busy}><Undo2 />Discard</Button>
        <Button onClick={save} disabled={!changed.length || busy} title="Ctrl + S">{busy ? <Loader2 className="animate-spin" /> : <Save />}Save changes</Button>
      </StickyActions>
    </>
  )
}
