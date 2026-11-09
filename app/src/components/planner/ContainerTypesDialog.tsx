import { useState } from 'react'
import { Archive, ArchiveRestore, Loader2, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { ContainerType } from '@/lib/containers'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

type F = { id?: string; name: string; is_reefer: boolean; max_pallets: string; max_payload_kg: string; pallet_type: string; empty_pallet_kg: string; internal_volume_cbm: string; notes: string }
const blank: F = { name: '', is_reefer: true, max_pallets: '', max_payload_kg: '', pallet_type: '', empty_pallet_kg: '', internal_volume_cbm: '', notes: '' }

export function ContainerTypesDialog({ open, onOpenChange, types, canEdit, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; types: ContainerType[]; canEdit: boolean; onSaved: () => void
}) {
  const [f, setF] = useState<F | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f) return
    const mp = Number(f.max_pallets), pl = Number(f.max_payload_kg), ep = f.empty_pallet_kg.trim() === '' ? 0 : Number(f.empty_pallet_kg)
    if (f.name.trim().length < 2) return toast.error('Enter a name')
    if (!Number.isInteger(mp) || mp <= 0) return toast.error('Max pallets must be a whole number above 0')
    if (!(pl > 0)) return toast.error('Payload must be above 0')
    if (!(ep >= 0)) return toast.error('Empty pallet weight cannot be negative')
    const row = {
      name: f.name.trim(), is_reefer: f.is_reefer, max_pallets: mp, max_payload_kg: pl, empty_pallet_kg: ep,
      pallet_type: f.pallet_type.trim() || null, notes: f.notes.trim() || null,
      internal_volume_cbm: f.internal_volume_cbm.trim() === '' ? null : Number(f.internal_volume_cbm),
    }
    setBusy(true)
    const { error } = f.id ? await supabase.from('container_types').update(row).eq('id', f.id) : await supabase.from('container_types').insert(row)
    setBusy(false)
    if (error) return toast.error(error.message.includes('name_uq') ? 'A container with this name already exists.' : error.message)
    toast.success('Container type saved'); setF(null); onSaved()
  }

  async function toggle(t: ContainerType) {
    const { error } = await supabase.from('container_types').update({ archived_at: t.archived_at ? null : new Date().toISOString() }).eq('id', t.id)
    if (error) return toast.error(error.message)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setF(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Container types</DialogTitle>
          <DialogDescription>Use the limits your shipping line or forwarder confirms. Old plans keep the limits they were saved with.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {f ? (
            <form onSubmit={save} className="grid grid-cols-2 gap-3">
              <Field label="Name" className="col-span-2"><Input placeholder="e.g. 40' HC Reefer" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Max pallets"><Input inputMode="numeric" value={f.max_pallets} onChange={(e) => setF({ ...f, max_pallets: e.target.value })} /></Field>
              <Field label="Max payload (kg)"><Input inputMode="decimal" value={f.max_payload_kg} onChange={(e) => setF({ ...f, max_payload_kg: e.target.value })} /></Field>
              <Field label="Pallet type"><Input placeholder="e.g. Euro 120×80" value={f.pallet_type} onChange={(e) => setF({ ...f, pallet_type: e.target.value })} /></Field>
              <Field label="Empty pallet weight (kg)"><Input inputMode="decimal" value={f.empty_pallet_kg} onChange={(e) => setF({ ...f, empty_pallet_kg: e.target.value })} /></Field>
              <Field label="Internal volume (m³, optional)"><Input inputMode="decimal" value={f.internal_volume_cbm} onChange={(e) => setF({ ...f, internal_volume_cbm: e.target.value })} /></Field>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" className="size-4 accent-[#23856B]" checked={f.is_reefer} onChange={(e) => setF({ ...f, is_reefer: e.target.checked })} />Refrigerated (reefer)</label>
              <Field label="Notes (e.g. source of these limits)" className="col-span-2"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
              <div className="col-span-2 flex gap-2">
                <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save</Button>
                <Button type="button" variant="ghost" onClick={() => setF(null)}>Cancel</Button>
              </div>
            </form>
          ) : canEdit && <Button variant="outline" onClick={() => setF(blank)}><Plus />Add container type</Button>}
          {!types.length ? <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No container types yet.</p> : (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {types.map((t) => (
                <li key={t.id} className={'flex items-center gap-3 p-3 ' + (t.archived_at ? 'opacity-50' : '')}>
                  <div className="flex-1">
                    <div className="font-medium">{t.name} <span className="text-xs font-normal text-muted-foreground">{t.is_reefer ? 'Reefer' : 'Dry'}</span></div>
                    <div className="text-xs text-muted-foreground">
                      {t.max_pallets} pallets{t.pallet_type ? ` (${t.pallet_type})` : ''} · {Number(t.max_payload_kg).toLocaleString()} kg payload · empty pallet {t.empty_pallet_kg} kg
                      {t.notes ? ` · ${t.notes}` : ''}
                    </div>
                  </div>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setF({
                        id: t.id, name: t.name, is_reefer: t.is_reefer, max_pallets: String(t.max_pallets), max_payload_kg: String(t.max_payload_kg),
                        pallet_type: t.pallet_type ?? '', empty_pallet_kg: String(t.empty_pallet_kg), internal_volume_cbm: t.internal_volume_cbm == null ? '' : String(t.internal_volume_cbm), notes: t.notes ?? '',
                      })}><Pencil /></Button>
                      <Button variant="ghost" size="icon" aria-label={t.archived_at ? 'Restore' : 'Archive'} onClick={() => toggle(t)}>{t.archived_at ? <ArchiveRestore /> : <Archive />}</Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
