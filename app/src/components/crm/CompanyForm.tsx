import { T } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { CRM_ASSIGNERS } from '@/lib/roles'
import { INCOTERMS } from '@/lib/pricing'
import { COMPANY_TYPE, CONTACT_METHOD, findDuplicates, LEAD_STATUS, PRIORITY, type Company, type DuplicateHit, type TeamMember } from '@/lib/crm'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { DuplicateList } from './DuplicateList'

type F = Record<string, string>
const TEXT_FIELDS = ['name', 'country', 'city', 'address', 'website', 'company_type', 'business_description', 'email', 'phone', 'whatsapp', 'linkedin',
  'preferred_contact', 'products_interested', 'product_category', 'current_supplier', 'current_supplier_country', 'estimated_volume',
  'packaging_requirements', 'target_market', 'preferred_incoterm', 'preferred_payment_terms', 'lead_source', 'lead_status', 'priority',
  'last_contact_date', 'next_follow_up_date', 'notes', 'owner_id'] as const

const toForm = (c: Company | null, me: string | undefined): F => {
  const f: F = {}
  for (const k of TEXT_FIELDS) f[k] = c ? String((c as Record<string, unknown>)[k] ?? '') : ''
  f.tags = c?.tags.join(', ') ?? ''
  if (!c) { f.lead_status = 'new_lead'; f.priority = 'medium'; f.owner_id = me ?? '' }
  // contact for new companies
  f.contact_name = ''; f.contact_job = ''
  return f
}

export function CompanyForm({ open, onOpenChange, company, team, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; company: Company | null; team: TeamMember[]; onSaved: (id: string) => void
}) {
  const { hasRole, session } = useAuth()
  const canAssign = hasRole(...CRM_ASSIGNERS)
  const [f, setF] = useState<F>(toForm(company, session?.user.id))
  const [dups, setDups] = useState<DuplicateHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF(toForm(company, session?.user.id)); setDups(null) } }, [open, company, session])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setF((x) => ({ ...x, [k]: e.target.value })); setDups(null) }
  const inp = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, cls = '') =>
    <Field label={label} className={cls}><Input value={f[k]} onChange={set(k)} {...props} /></Field>

  async function submit(force = false) {
    if (!f.name.trim()) return toast.error('Company name is required.')
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return toast.error('Email is not valid.')
    if (f.website && /\s/.test(f.website.trim())) return toast.error('Website cannot contain spaces.')
    setBusy(true)
    try {
      if (!force) {
        const hits = await findDuplicates([{ name: f.name, website: f.website, email: f.email, phone: f.phone || f.whatsapp, country: f.country, exclude_id: company?.id ?? null }])
        if (hits.length) { setDups(hits); setBusy(false); return }
      }
      const row: Record<string, unknown> = {}
      for (const k of TEXT_FIELDS) row[k] = f[k].trim() === '' ? null : f[k].trim()
      row.tags = f.tags.split(',').map((x) => x.trim()).filter(Boolean)
      row.lead_status = row.lead_status ?? 'new_lead'; row.priority = row.priority ?? 'medium'
      if (!canAssign) delete row.owner_id
      else if (!row.owner_id) row.owner_id = null
      let id = company?.id
      if (id) {
        const { error, data } = await supabase.from('companies').update(row).eq('id', id).select('id')
        if (error || !data?.length) throw new Error(error?.message ?? 'You cannot edit this company.')
      } else {
        if (!canAssign) row.owner_id = session?.user.id
        const { error, data } = await supabase.from('companies').insert(row).select('id').single()
        if (error) throw error
        id = data.id
        if (f.contact_name.trim()) {
          const c = await supabase.from('company_contacts').insert({ company_id: id, name: f.contact_name.trim(), job_title: f.contact_job.trim() || null, email: row.email, phone: row.phone, whatsapp: row.whatsapp, linkedin: row.linkedin, is_primary: true })
          if (c.error) toast.error('Company saved, contact failed: ' + c.error.message)
        }
      }
      toast.success(company ? 'Company updated' : 'Company added')
      onOpenChange(false); onSaved(id!)
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{company ? `Edit ${company.name}` : 'Add company'}</DialogTitle>
          <DialogDescription>We check for duplicates across the whole company before saving.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-3">
            {inp('name', 'Company name *', {}, 'sm:col-span-2')}
            <Field label="Company type"><Select value={f.company_type} onChange={set('company_type')}><option value="">—</option>{Object.entries(COMPANY_TYPE).map(([k, l]) => <option key={k} value={k}><T>{l}</T></option>)}</Select></Field>
            {inp('country', 'Country')}{inp('city', 'City')}{inp('website', 'Website', { placeholder: 'https://' })}
            {inp('address', 'Address', {}, 'sm:col-span-3')}
            {inp('email', 'Email', { type: 'email' })}{inp('phone', 'Phone')}{inp('whatsapp', 'WhatsApp')}
            {inp('linkedin', 'LinkedIn')}
            <Field label="Preferred contact"><Select value={f.preferred_contact} onChange={set('preferred_contact')}><option value="">—</option>{Object.entries(CONTACT_METHOD).map(([k, l]) => <option key={k} value={k}><T>{l}</T></option>)}</Select></Field>
            {!company && <>{inp('contact_name', 'Contact person')}{inp('contact_job', 'Job title')}</>}
          </section>
          <section className="grid gap-3 sm:grid-cols-3">
            {inp('products_interested', 'Products interested in', {}, 'sm:col-span-2')}{inp('product_category', 'Product category', { placeholder: 'Fresh / Frozen / Jam' })}
            {inp('current_supplier', 'Current supplier')}{inp('current_supplier_country', 'Supplier country')}{inp('estimated_volume', 'Estimated monthly volume')}
            {inp('packaging_requirements', 'Packaging requirements')}{inp('target_market', 'Target market')}
            <Field label="Preferred Incoterm"><Select value={f.preferred_incoterm} onChange={set('preferred_incoterm')}><option value="">—</option>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</Select></Field>
            {inp('preferred_payment_terms', 'Preferred payment terms')}{inp('lead_source', 'Lead source', { placeholder: 'Exhibition, website, referral…' })}
          </section>
          <section className="grid gap-3 sm:grid-cols-3">
            <Field label="Status"><Select value={f.lead_status} onChange={set('lead_status')}>{Object.entries(LEAD_STATUS).map(([k, l]) => <option key={k} value={k}><T>{l}</T></option>)}</Select></Field>
            <Field label="Priority"><Select value={f.priority} onChange={set('priority')}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}><T>{l}</T></option>)}</Select></Field>
            <Field label="Owner (sales)" hint={canAssign ? undefined : 'Only managers can change the owner'}>
              <Select value={f.owner_id} onChange={set('owner_id')} disabled={!canAssign}>
                <option value="">Unassigned</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            {inp('last_contact_date', 'Last contact', { type: 'date' })}{inp('next_follow_up_date', 'Next follow-up', { type: 'date' })}
            {inp('tags', 'Tags', { placeholder: 'comma separated' })}
            <Field label="Business description" className="sm:col-span-3"><Textarea value={f.business_description} onChange={set('business_description')} /></Field>
            <Field label="Internal notes" className="sm:col-span-3"><Textarea value={f.notes} onChange={set('notes')} /></Field>
          </section>
          {dups && <DuplicateList hits={dups} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {dups?.length ? (
            <Button variant="destructive" onClick={() => submit(true)} disabled={busy}>{busy && <Loader2 className="animate-spin" />}It’s a different company — save anyway</Button>
          ) : (
            <Button onClick={() => submit(false)} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
