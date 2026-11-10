import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { archivedToast } from '@/lib/undo'
import { useAuth } from '@/lib/auth'
import { CRM_ASSIGNERS } from '@/lib/roles'
import { CURRENCIES } from '@/lib/pricing'
import type { Company, TeamMember } from '@/lib/crm'
import type { Product } from '@/lib/catalog'
import type { Opportunity, Stage } from '@/lib/sales'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'

type F = Record<'title' | 'company_id' | 'stage_id' | 'product_id' | 'product_text' | 'expected_quantity' | 'quantity_unit' | 'expected_revenue' | 'currency' | 'probability' | 'expected_close_date' | 'next_action' | 'notes' | 'lost_reason' | 'owner_id', string>

export function OpportunityDialog({ open, onOpenChange, opp, stages, companies, products, team, defaultCompanyId, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; opp: Opportunity | null; stages: Stage[]; companies: Company[]
  products: Product[]; team: TeamMember[]; defaultCompanyId?: string; onSaved: () => void
}) {
  const { hasRole, session } = useAuth()
  const canAssign = hasRole(...CRM_ASSIGNERS)
  const active = stages.filter((s) => !s.archived_at)
  const init = (): F => ({
    title: opp?.title ?? '', company_id: opp?.company_id ?? defaultCompanyId ?? '', stage_id: opp?.stage_id ?? active[0]?.id ?? '',
    product_id: opp?.product_id ?? '', product_text: opp?.product_text ?? '', expected_quantity: opp?.expected_quantity?.toString() ?? '',
    quantity_unit: opp?.quantity_unit ?? 'tons', expected_revenue: opp?.expected_revenue?.toString() ?? '', currency: opp?.currency ?? 'USD',
    probability: opp?.probability?.toString() ?? '', expected_close_date: opp?.expected_close_date ?? '', next_action: opp?.next_action ?? '',
    notes: opp?.notes ?? '', lost_reason: opp?.lost_reason ?? '', owner_id: opp?.owner_id ?? session?.user.id ?? '',
  })
  const [f, setF] = useState<F>(init())
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF(init()) }, [open, opp, defaultCompanyId]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const stage = stages.find((s) => s.id === f.stage_id)
  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  async function save() {
    if (!f.title.trim()) return toast.error('Give the deal a title.')
    if (!f.company_id) return toast.error('Choose a company.')
    const p = num(f.probability)
    if (p != null && !(Number.isInteger(p) && p >= 0 && p <= 100)) return toast.error('Probability must be a whole number 0–100.')
    for (const k of ['expected_quantity', 'expected_revenue'] as const) if (num(f[k]) != null && !(num(f[k])! >= 0)) return toast.error('Numbers cannot be negative.')
    if (stage?.is_lost && !f.lost_reason.trim()) return toast.error('Write why the deal was lost.')
    const row: Record<string, unknown> = {
      title: f.title.trim(), stage_id: f.stage_id, product_id: f.product_id || null, product_text: f.product_text.trim() || null,
      expected_quantity: num(f.expected_quantity), quantity_unit: num(f.expected_quantity) ? f.quantity_unit : null, expected_revenue: num(f.expected_revenue),
      currency: f.currency, probability: p, expected_close_date: f.expected_close_date || null, next_action: f.next_action.trim() || null,
      notes: f.notes.trim() || null, lost_reason: stage?.is_lost ? f.lost_reason.trim() : null,
    }
    if (canAssign) row.owner_id = f.owner_id || null
    setBusy(true)
    const res = opp
      ? await supabase.from('opportunities').update(row).eq('id', opp.id).select('id')
      : await supabase.from('opportunities').insert({ ...row, company_id: f.company_id, ...(canAssign ? {} : { owner_id: session?.user.id }) }).select('id')
    setBusy(false)
    if (res.error || !res.data?.length) return toast.error(res.error?.message ?? 'Not allowed.')
    toast.success(opp ? 'Deal updated' : 'Deal added'); onOpenChange(false); onSaved()
  }

  async function archive() {
    if (!opp) return
    const { error } = await supabase.from('opportunities').update({ archived_at: new Date().toISOString() }).eq('id', opp.id)
    if (error) return toast.error(error.message)
    archivedToast('Deal', 'opportunities', opp.id, onSaved); onOpenChange(false); onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{opp ? 'Edit deal' : 'New deal'}</DialogTitle></DialogHeader>
        <DialogBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Title *" className="sm:col-span-2"><Input value={f.title} onChange={set('title')} placeholder="e.g. IQF Mango — 2 × 40' reefer" /></Field>
          <Field label="Company *" className="sm:col-span-2">
            <Select value={f.company_id} onChange={set('company_id')} disabled={!!opp}>
              <option value="">Choose…</option>
              {companies.filter((c) => !c.archived_at || c.id === f.company_id).map((c) => <option key={c.id} value={c.id}>{c.name}{c.country ? ` — ${c.country}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Stage"><Select value={f.stage_id} onChange={set('stage_id')}>{stages.filter((s) => !s.archived_at || s.id === f.stage_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Probability %" hint="Your estimate; used for the weighted value"><Input inputMode="numeric" value={f.probability} onChange={set('probability')} /></Field>
          {stage?.is_lost && <Field label="Why lost? *" className="sm:col-span-2"><Input value={f.lost_reason} onChange={set('lost_reason')} placeholder="Price, timing, competitor…" /></Field>}
          <Field label="Product"><Select value={f.product_id} onChange={set('product_id')}><option value="">—</option>{products.filter((p) => !p.archived_at).sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.product_type})</option>)}</Select></Field>
          <Field label="Product details"><Input value={f.product_text} onChange={set('product_text')} placeholder="variety, packing…" /></Field>
          <Field label="Expected quantity">
            <div className="flex gap-1"><Input inputMode="decimal" value={f.expected_quantity} onChange={set('expected_quantity')} />
              <Select value={f.quantity_unit} onChange={set('quantity_unit')} className="w-[92px]" aria-label="Unit"><option value="tons">tons</option><option value="pallets">pallets</option><option value="cartons">cartons</option></Select></div>
          </Field>
          <Field label="Expected revenue">
            <div className="flex gap-1"><Input inputMode="decimal" value={f.expected_revenue} onChange={set('expected_revenue')} />
              <Select value={f.currency} onChange={set('currency')} className="w-[84px]" aria-label="Currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></div>
          </Field>
          <Field label="Expected closing date"><Input type="date" value={f.expected_close_date} onChange={set('expected_close_date')} /></Field>
          <Field label="Owner" hint={canAssign ? undefined : 'Only managers can change'}>
            <Select value={f.owner_id} onChange={set('owner_id')} disabled={!canAssign}><option value="">Unassigned</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          </Field>
          <Field label="Next action" className="sm:col-span-2"><Input value={f.next_action} onChange={set('next_action')} placeholder="e.g. Send samples by DHL" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={set('notes')} /></Field>
        </DialogBody>
        <DialogFooter>
          {opp && <Button variant="ghost" className="mr-auto text-destructive" onClick={archive}>Archive</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
