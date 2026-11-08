import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
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
      <PageHeader title="Company Settings" summary="Shown on quotations and invoices. Only the Super Admin can change these." />
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
    </>
  )
}
