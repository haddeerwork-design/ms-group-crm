import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog'
import { Button } from './button'
import { Input } from './input'
import { Select } from './select'
import { Textarea } from './textarea'
import { Field } from './field'
import { cn } from '@/lib/utils'

export type FieldSpec = {
  key: string; label: string; type?: 'text' | 'number' | 'date' | 'email' | 'textarea' | 'select'
  options?: { value: string; label: string }[]; span?: 1 | 2 | 3; required?: boolean; placeholder?: string; hint?: string
}

/** Small reusable dialog form. Values are strings; empty strings mean "not set". */
export function SimpleFormDialog({ open, onOpenChange, title, description, fields, initial, readOnly, onSubmit, extraFooter }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; fields: FieldSpec[]
  initial: Record<string, string>; readOnly?: boolean; onSubmit: (v: Record<string, string>) => Promise<boolean>; extraFooter?: React.ReactNode
}) {
  const [v, setV] = useState(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setV(initial) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  async function submit() {
    for (const f of fields) if (f.required && !(v[f.key] ?? '').trim()) return alertMissing(f.label)
    setBusy(true)
    const ok = await onSubmit(v)
    setBusy(false)
    if (ok) onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <DialogBody>
          <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-3">
            {fields.map((f) => (
              <Field key={f.key} label={f.label + (f.required ? ' *' : '')} hint={f.hint} className={cn(f.span === 2 && 'sm:col-span-2', f.span === 3 && 'sm:col-span-3')}>
                {f.type === 'textarea' ? <Textarea value={v[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                  : f.type === 'select' ? <Select value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                  : <Input type={f.type === 'number' ? 'text' : f.type ?? 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} placeholder={f.placeholder}
                      value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
              </Field>
            ))}
          </fieldset>
        </DialogBody>
        <DialogFooter>
          {extraFooter}
          <Button variant="outline" onClick={() => onOpenChange(false)}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
function alertMissing(label: string) { import('sonner').then(({ toast }) => toast.error(`${label} is required.`)) }

/** Converts form strings to a DB row: '' → null, numbers parsed for given keys. Returns an error message for bad numbers. */
export function toRow(v: Record<string, string>, numberKeys: string[] = []): { row: Record<string, unknown>; error: string | null } {
  const row: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v)) {
    const t = (x ?? '').trim()
    if (numberKeys.includes(k)) {
      if (t === '') row[k] = null
      else if (!isFinite(Number(t)) || Number(t) < 0) return { row, error: `“${t}” is not a valid number.` }
      else row[k] = Number(t)
    } else row[k] = t === '' ? null : t
  }
  return { row, error: null }
}
export const fromRow = (r: Record<string, unknown> | null | undefined, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, r?.[k] == null ? '' : String(r[k])]))
