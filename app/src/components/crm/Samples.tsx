import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { T, TV, tr } from '@/lib/i18n'
import { fetchCatalog, type Product } from '@/lib/catalog'
import { fmtDateDMY } from '@/lib/quotations'
import { addDays, awaitingFeedback, FEEDBACK_AFTER_DAYS, fetchSamples, SAMPLE_STATUS, SAMPLE_TONE, trackingUrl, type Sample, type SampleStatus } from '@/lib/samples'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { Empty, Loading } from '@/components/ui/states'
import { cn } from '@/lib/utils'

const today = () => new Date().toISOString().slice(0, 10)
type Form = { id: string; product_id: string; product_name: string; quantity: string; sent_date: string; courier: string; tracking_no: string; status: SampleStatus; feedback: string; notes: string }
const blank = (): Form => ({ id: '', product_id: '', product_name: '', quantity: '', sent_date: today(), courier: '', tracking_no: '', status: 'sent', feedback: '', notes: '' })

export function Samples({ companyId, companyName, canEdit, onCount }: { companyId: string; companyName: string; canEdit: boolean; onCount?: (n: number) => void }) {
  const { session } = useAuth()
  const [rows, setRows] = useState<Sample[] | null>(null)
  const [ready, setReady] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [f, setF] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => fetchSamples(companyId).then((r) => { setRows(r.rows); setReady(r.ready); onCount?.(r.rows.length) }), [companyId, onCount])
  useEffect(() => { load(); fetchCatalog().then((c) => setProducts(c.products.filter((p) => !p.archived_at))).catch(() => {}) }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f) return
    const name = f.product_name.trim() || products.find((p) => p.id === f.product_id)?.name || ''
    if (!name) return toast.error('Choose a product or type its name')
    setBusy(true)
    const row = {
      product_id: f.product_id || null, product_name: name, quantity: f.quantity.trim() || null, sent_date: f.sent_date || today(),
      courier: f.courier.trim() || null, tracking_no: f.tracking_no.trim() || null, status: f.status,
      feedback: f.feedback.trim() || null, notes: f.notes.trim() || null,
      feedback_date: f.status.startsWith('feedback') || f.status === 'no_answer' ? today() : null,
    }
    const res = f.id
      ? await supabase.from('samples').update(row).eq('id', f.id).select('id')
      : await supabase.from('samples').insert({ ...row, company_id: companyId, created_by: session!.user.id }).select('id')
    setBusy(false)
    if (res.error || !res.data?.length) return toast.error(res.error?.message ?? 'Not allowed.')
    toast.success('Sample saved')
    if (!f.id && row.status === 'sent') await addFeedbackTask(name, row.sent_date)
    setF(null); load()
  }

  /** A reminder to ask for the customer's opinion, a week after sending (with Undo). */
  async function addFeedbackTask(product: string, sent: string) {
    const due = addDays(sent, FEEDBACK_AFTER_DAYS)
    const { data, error } = await supabase.from('tasks').insert({
      title: tr('Ask {company} for feedback on the {product} sample', { company: companyName, product }),
      company_id: companyId, assignee_id: session!.user.id, created_by: session!.user.id, due_date: due < today() ? today() : due, priority: 'medium', status: 'open',
    }).select('id').single()
    if (error || !data) return
    toast.message(tr('Follow-up task added for {date}', { date: fmtDateDMY(due < today() ? today() : due) }), {
      duration: 8000,
      action: { label: tr('Undo'), onClick: async () => { await supabase.from('tasks').delete().eq('id', data.id); toast.success('Follow-up removed') } },
    })
  }

  async function setStatus(s: Sample, status: SampleStatus) {
    const { error, data } = await supabase.from('samples').update({ status, feedback_date: status.startsWith('feedback') || status === 'no_answer' ? today() : s.feedback_date }).eq('id', s.id).select('id')
    if (error || !data?.length) return toast.error(error?.message ?? 'Not allowed.')
    toast.success('Status updated'); load()
    if (status.startsWith('feedback') && !s.feedback) setF(toForm({ ...s, status }))
  }
  async function remove(s: Sample) {
    if (!window.confirm(tr('Delete the {product} sample?', { product: s.product_name }))) return
    const { error, data } = await supabase.from('samples').delete().eq('id', s.id).select('id')
    if (error || !data?.length) return toast.error(error?.message ?? 'Only the person who added it (or a manager) can delete it.')
    load()
  }

  if (!rows) return <Loading />
  if (!ready) return <Empty title="Samples are not set up yet" hint="Run migration 0019_docs_samples_photos in Supabase, then refresh." />
  const waiting = rows.filter(awaitingFeedback).length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {canEdit && !f && <Button variant="outline" onClick={() => setF(blank())}><Plus />Add sample</Button>}
        {waiting > 0 && <span className="text-sm text-muted-foreground"><TV k="Waiting for feedback: {n}" v={{ n: waiting }} /></span>}
      </div>

      {f && (
        <Card><CardContent className="pt-5">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
            <Field label="Product *">
              <Select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value, product_name: '' })}>
                <option value="">Other (type the name) …</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            {!f.product_id
              ? <Field label="Product name"><Input value={f.product_name} onChange={(e) => setF({ ...f, product_name: e.target.value })} placeholder="e.g. Fresh oranges" autoFocus /></Field>
              : <div className="hidden sm:block" />}
            <Field label="Quantity"><Input value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} placeholder="e.g. 2 kg, 3 jars" /></Field>
            <Field label="Sent on"><Input type="date" value={f.sent_date} onChange={(e) => setF({ ...f, sent_date: e.target.value })} /></Field>
            <Field label="Courier"><Input value={f.courier} onChange={(e) => setF({ ...f, courier: e.target.value })} placeholder="DHL, Aramex, FedEx…" list="sample-couriers" />
              <datalist id="sample-couriers"><option value="DHL" /><option value="Aramex" /><option value="FedEx" /><option value="UPS" /></datalist></Field>
            <Field label="Tracking number"><Input value={f.tracking_no} onChange={(e) => setF({ ...f, tracking_no: e.target.value })} /></Field>
            <Field label="Status">
              <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SampleStatus })}>
                {Object.entries(SAMPLE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Customer feedback" className="sm:col-span-2"><Textarea rows={2} value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} placeholder="What did they say about taste, size, colour, packing?" /></Field>
            <Field label="Notes" className="sm:col-span-3"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            {!f.id && f.status === 'sent' && <p className="text-xs text-muted-foreground sm:col-span-3"><TV k="A reminder to ask for feedback will be added {n} days after the sent date." v={{ n: FEEDBACK_AFTER_DAYS }} /></p>}
            <div className="flex gap-2 sm:col-span-3"><Button type="submit" disabled={busy}>Save</Button><Button type="button" variant="ghost" onClick={() => setF(null)}>Cancel</Button></div>
          </form>
        </CardContent></Card>
      )}

      {!rows.length && !f ? (
        <Empty title="No samples sent yet" hint="Keep track of every sample: what you sent, the tracking number and what the customer thought."
          action={canEdit ? <Button variant="outline" onClick={() => setF(blank())}><Plus />Add sample</Button> : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((s) => {
            const url = trackingUrl(s.courier, s.tracking_no)
            return (
              <Card key={s.id}><CardContent className="space-y-2 pt-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{s.product_name}{s.quantity && <span className="font-normal text-muted-foreground"> · {s.quantity}</span>}</div>
                    <div className="text-xs text-muted-foreground"><T>Sent</T> {fmtDateDMY(s.sent_date)}{s.courier && ` · ${s.courier}`}
                      {s.tracking_no && (url
                        ? <> · <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">{s.tracking_no}<ExternalLink className="size-3" /></a></>
                        : ` · ${s.tracking_no}`)}
                    </div>
                  </div>
                  {canEdit && <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setF(toForm(s))}><Pencil /></Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(s)}><Trash2 /></Button>
                  </div>}
                </div>
                {canEdit ? (
                  <Select aria-label="Status" value={s.status} onChange={(e) => setStatus(s, e.target.value as SampleStatus)} className={cn('h-8 w-auto font-medium', SAMPLE_TONE[s.status])}>
                    {Object.entries(SAMPLE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </Select>
                ) : <span className={cn('inline-block rounded-full border px-2 py-0.5 text-xs', SAMPLE_TONE[s.status])}><T>{SAMPLE_STATUS[s.status]}</T></span>}
                {s.feedback && <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm"><bdi>“{s.feedback}”</bdi>{s.feedback_date && <span className="ms-1 text-xs text-muted-foreground">— {fmtDateDMY(s.feedback_date)}</span>}</p>}
                {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
              </CardContent></Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

const toForm = (s: Sample): Form => ({
  id: s.id, product_id: s.product_id ?? '', product_name: s.product_id ? '' : s.product_name, quantity: s.quantity ?? '', sent_date: s.sent_date,
  courier: s.courier ?? '', tracking_no: s.tracking_no ?? '', status: s.status, feedback: s.feedback ?? '', notes: s.notes ?? '',
})
