import { T } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PAY_METHOD, type PayStatus, type Payment } from '@/lib/orders'
import { money } from '@/lib/prices'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const STYLE: Record<PayStatus, [string, string]> = {
  paid: ['Paid', 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'],
  partial: ['Partially paid', 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200'],
  unpaid: ['Unpaid', 'border-border bg-muted text-muted-foreground'],
  overdue: ['Overdue', 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'],
  cancelled: ['Cancelled', 'border-zinc-300 bg-zinc-100 text-zinc-600 line-through dark:border-zinc-700 dark:bg-zinc-900'],
}
export const PaymentStatusBadge = ({ s }: { s: PayStatus }) => <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STYLE[s][1])}>{STYLE[s][0]}</span>

/** Records money actually received / paid. Needs date, method and reference (the database enforces it). */
export function RecordPaymentDialog({ payment, onClose, onSaved }: { payment: Payment | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ amount: '', date: '', method: 'bank_transfer', reference: '', notes: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (payment) setV({ amount: String(payment.amount_paid || payment.amount_due), date: payment.paid_date ?? new Date().toISOString().slice(0, 10), method: payment.method ?? 'bank_transfer', reference: payment.reference ?? '', notes: payment.notes ?? '' }) }, [payment])
  async function save() {
    if (!payment) return
    const amount = Number(v.amount)
    if (!(amount >= 0) || !isFinite(amount)) return toast.error('Enter a valid amount.')
    if (amount > 0 && (!v.date || !v.reference.trim())) return toast.error('Enter the date and the bank / transaction reference.')
    if (amount > payment.amount_due && !window.confirm(`This is more than the amount due (${payment.amount_due}). Continue?`)) return
    setBusy(true)
    const { error } = await supabase.from('payments').update({ amount_paid: amount, paid_date: amount ? v.date : null, method: amount ? v.method : null, reference: amount ? v.reference.trim() : null, notes: v.notes.trim() || null }).eq('id', payment.id)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Payment recorded'); onClose(); onSaved()
  }
  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{payment?.direction === 'out' ? 'Record payment made' : 'Record payment received'}</DialogTitle>
          <DialogDescription>{payment ? `Due ${money(payment.amount_due, payment.currency)}. Enter the TOTAL received so far for this line.` : ''}</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-3 sm:grid-cols-2">
          <Field label={`Amount (${payment?.currency ?? ''})`}><Input inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
          <Field label="Method"><Select value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>{Object.entries(PAY_METHOD).map(([k, l]) => <option key={k} value={k}><T>{l}</T></option>)}</Select></Field>
          <Field label="Reference *" hint="Bank / SWIFT / L/C number"><Input value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Input value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
