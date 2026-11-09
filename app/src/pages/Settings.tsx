import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorState, Loading } from '@/components/ui/states'

const opt = z.string().trim().max(300).optional().or(z.literal(''))
const schema = z.object({
  company_name: z.string().trim().min(2, 'Required').max(120),
  slogan: opt,
  website: z.string().trim().url('Must start with https://').optional().or(z.literal('')),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  phone: opt,
  whatsapp: opt,
  address: opt,
})
type Form = z.infer<typeof schema>
const FIELDS: { k: keyof Form; label: string; wide?: boolean }[] = [
  { k: 'company_name', label: 'Company name' }, { k: 'slogan', label: 'Slogan' },
  { k: 'website', label: 'Website' }, { k: 'email', label: 'Email' },
  { k: 'phone', label: 'Phone' }, { k: 'whatsapp', label: 'WhatsApp' },
  { k: 'address', label: 'Address', wide: true },
]

export function Settings() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('super_admin')
  const [state, setState] = useState<'loading' | 'ready' | string>('loading')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<Form>({ resolver: zodResolver(schema) })

  async function load() {
    const { data, error } = await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle()
    if (error) return setState(error.message)
    if (!data) return setState('Company settings row not found. Was migration 0001 run?')
    const clean = Object.fromEntries(FIELDS.map(({ k }) => [k, data[k] ?? ''])) as Form
    reset(clean); setUpdatedAt(data.updated_at); setState('ready')
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (v: Form) => {
    const payload = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? null : x]))
    const { data, error } = await supabase.from('company_settings').update(payload).eq('id', 1).select()
    if (error) return toast.error(error.message)
    if (!data?.length) return toast.error('Not saved: your role is not allowed to change company settings.')
    toast.success('Company settings saved'); load()
  }

  return (
    <>
      <PageHeader title="Company Settings" summary="Only the Super Admin can change these." />
      <p className="mb-4 text-sm text-muted-foreground">Quotations print on the El Brancy letterhead image, which already contains its own WhatsApp, email and address. The company name and slogan below are printed in the text.</p>
      <Card>
        <CardContent className="pt-5">
          {state === 'loading' ? <Loading /> : state !== 'ready' ? <ErrorState message={state} /> : (
            <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
              {FIELDS.map(({ k, label, wide }) => (
                <div key={k} className={wide ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
                  <Label htmlFor={k}>{label}</Label>
                  <Input id={k} disabled={!canEdit} {...register(k)} />
                  {errors[k] && <p className="text-xs text-destructive">{errors[k]?.message}</p>}
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <span className="text-xs text-muted-foreground">{updatedAt && `Last updated ${new Date(updatedAt).toLocaleString()}`}</span>
                {canEdit
                  ? <Button type="submit" disabled={isSubmitting || !isDirty}>{isSubmitting && <Loader2 className="animate-spin" />}Save changes</Button>
                  : <span className="text-xs text-muted-foreground">Read-only for your role</span>}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
      <QuotationDefaults canEdit={canEdit} />
    </>
  )
}

function QuotationDefaults({ canEdit }: { canEdit: boolean }) {
  const [v, setV] = useState<{ policy: string; days: string; production: string; bank: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function load() {
    const { data, error } = await supabase.from('company_settings').select('quotation_policy, quotation_validity_days, quotation_production_time, bank_details').eq('id', 1).single()
    if (error) return setErr(error.message.includes('column') ? 'Run the latest migration to enable these settings.' : error.message)
    setV({ policy: (data.quotation_policy ?? []).join('\n'), days: data.quotation_validity_days == null ? '' : String(data.quotation_validity_days), production: data.quotation_production_time ?? '', bank: data.bank_details ?? '' })
  }
  useEffect(() => { load() }, [])
  async function save() {
    if (!v) return
    const days = v.days.trim() === '' ? null : Number(v.days)
    if (days != null && !(Number.isInteger(days) && days >= 1 && days <= 365)) return toast.error('Validity must be 1–365 days')
    setSaving(true)
    const { data, error } = await supabase.from('company_settings').update({
      quotation_policy: v.policy.split('\n').map((x) => x.trim()).filter(Boolean), quotation_validity_days: days,
      quotation_production_time: v.production.trim() || null, bank_details: v.bank.trim() || null,
    }).eq('id', 1).select('id')
    setSaving(false)
    if (error) return toast.error(error.message)
    if (!data?.length) return toast.error('Your role cannot change settings.')
    toast.success('Quotation defaults saved'); load()
  }
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Quotation & proforma defaults</CardTitle>
        <CardDescription>Used for new quotations. In the policy you can write {'{validity_days}'}, {'{incoterm}'} and {'{production_time}'}; they are filled in for each quotation.</CardDescription>
      </CardHeader>
      <CardContent>
        {err ? <ErrorState message={err} /> : !v ? <Loading /> : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="qpolicy">Policy lines (one per line)</Label>
              <Textarea id="qpolicy" className="min-h-[130px]" disabled={!canEdit} value={v.policy} onChange={(e) => setV({ ...v, policy: e.target.value })} />
            </div>
            <div className="space-y-2"><Label htmlFor="qdays">Valid for (days)</Label><Input id="qdays" inputMode="numeric" disabled={!canEdit} value={v.days} onChange={(e) => setV({ ...v, days: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="qprod">Production time</Label><Input id="qprod" disabled={!canEdit} value={v.production} onChange={(e) => setV({ ...v, production: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="qbank">Bank details for proforma invoices</Label><Textarea id="qbank" disabled={!canEdit} value={v.bank} placeholder="Bank name, account name, IBAN, SWIFT…" onChange={(e) => setV({ ...v, bank: e.target.value })} /></div>
            {canEdit && <div className="sm:col-span-2"><Button onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />}Save document defaults</Button></div>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
