import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  activePackaging, AVAILABILITY_LABEL, MONTHS, PRODUCT_TYPE_LABEL,
  type Availability, type Category, type Product, type ProductType,
} from '@/lib/catalog'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'

const optNum = z.string().trim().refine((v) => v === '' || (isFinite(Number(v)) && Number(v) > 0), 'Must be a number above 0')
const optInt = z.string().trim().refine((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) > 0), 'Whole number above 0')

const packSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, 'Required').max(120),
  packaging_type: z.string().trim().max(80),
  net_weight_kg: optNum, gross_weight_kg: optNum,
  length_cm: optNum, width_cm: optNum, height_cm: optNum,
  cartons_per_pallet: optInt,
  variety: z.string().trim().max(80),
  units_per_pack: optInt, unit_name: z.string().trim().max(30), unit_weight_g: optNum,
  packs_per_container: optInt,
  notes: z.string().trim().max(300),
}).refine((p) => !p.net_weight_kg || !p.gross_weight_kg || Number(p.gross_weight_kg) >= Number(p.net_weight_kg),
  { message: 'Gross weight must be ≥ net weight', path: ['gross_weight_kg'] })

const schema = z.object({
  name: z.string().trim().min(2, 'Required').max(120),
  category_id: z.string().min(1, 'Choose a category'),
  product_type: z.enum(['fresh', 'frozen', 'jam']),
  varieties: z.string().max(300),
  origin: z.string().trim().max(80),
  season_start_month: z.string(), season_end_month: z.string(),
  availability: z.string(),
  specifications: z.string().max(2000), size_caliber: z.string().max(200),
  storage_temperature: z.string().max(100), shelf_life: z.string().max(100),
  moq_quantity: optNum, moq_unit: z.string().max(40),
  notes: z.string().max(2000),
  default_index: z.number(),
  packaging: z.array(packSchema),
}).refine((v) => (v.season_start_month === '') === (v.season_end_month === ''),
  { message: 'Choose both start and end month, or neither', path: ['season_end_month'] })

type Form = z.infer<typeof schema>
type PackForm = Form['packaging'][number]

const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: string) => (v.trim() === '' ? null : Number(v))
const t = (v: string) => (v.trim() === '' ? null : v.trim())

const emptyPack: PackForm = { label: '', packaging_type: '', net_weight_kg: '', gross_weight_kg: '', length_cm: '', width_cm: '', height_cm: '', cartons_per_pallet: '', variety: '', units_per_pack: '', unit_name: '', unit_weight_g: '', packs_per_container: '', notes: '' }

function toForm(p: Product | null, categories: Category[]): Form {
  const packs = p ? activePackaging(p) : []
  const cat = p ? categories.find((c) => c.id === p.category_id) : undefined
  return {
    name: p?.name ?? '', category_id: p?.category_id ?? '', product_type: p?.product_type ?? cat?.product_type ?? 'fresh',
    varieties: (p?.varieties ?? []).join(', '), origin: p?.origin ?? 'Egypt',
    season_start_month: s(p?.season_start_month), season_end_month: s(p?.season_end_month),
    availability: p?.availability ?? '', specifications: p?.specifications ?? '', size_caliber: p?.size_caliber ?? '',
    storage_temperature: p?.storage_temperature ?? '', shelf_life: p?.shelf_life ?? '',
    moq_quantity: s(p?.moq_quantity), moq_unit: p?.moq_unit ?? '', notes: p?.notes ?? '',
    default_index: Math.max(0, packs.findIndex((x) => x.is_default)),
    packaging: packs.map((x) => ({
      id: x.id, label: x.label, packaging_type: x.packaging_type ?? '',
      net_weight_kg: s(x.net_weight_kg), gross_weight_kg: s(x.gross_weight_kg),
      length_cm: s(x.length_cm), width_cm: s(x.width_cm), height_cm: s(x.height_cm),
      cartons_per_pallet: s(x.cartons_per_pallet), notes: x.notes ?? '',
      variety: x.variety ?? '', units_per_pack: s(x.units_per_pack), unit_name: x.unit_name ?? '',
      unit_weight_g: s(x.unit_weight_g), packs_per_container: s(x.packs_per_container),
    })),
  }
}

export function ProductDialog({ open, onOpenChange, product, categories, canEdit, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; product: Product | null
  categories: Category[]; canEdit: boolean; onSaved: () => void
}) {
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: toForm(product, categories) })
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = form
  const packs = useFieldArray({ control: form.control, name: 'packaging' })
  useEffect(() => { if (open) reset(toForm(product, categories)) }, [open, product, categories, reset])

  const defaultIndex = watch('default_index')
  const varietyOptions = (watch('varieties') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const activeCats = categories.filter((c) => !c.archived_at || c.id === product?.category_id)

  async function onSubmit(v: Form) {
    const row = {
      name: v.name.trim(), category_id: v.category_id, product_type: v.product_type as ProductType,
      varieties: v.varieties.split(',').map((x) => x.trim()).filter(Boolean),
      origin: t(v.origin), season_start_month: n(v.season_start_month), season_end_month: n(v.season_end_month),
      availability: (t(v.availability) as Availability | null), specifications: t(v.specifications),
      size_caliber: t(v.size_caliber), storage_temperature: t(v.storage_temperature), shelf_life: t(v.shelf_life),
      moq_quantity: n(v.moq_quantity), moq_unit: t(v.moq_unit), notes: t(v.notes),
    }
    let id = product?.id
    if (id) {
      const { error, data } = await supabase.from('products').update(row).eq('id', id).select('id')
      if (error) return toast.error(friendly(error.message))
      if (!data?.length) return toast.error('Not saved: your role cannot edit products.')
    } else {
      const { error, data } = await supabase.from('products').insert(row).select('id').single()
      if (error) return toast.error(friendly(error.message))
      id = data.id
    }

    // Packaging: clear the old default first (only one default is allowed), then save rows.
    const keepIds = new Set(v.packaging.map((p) => p.id).filter(Boolean))
    const existing = product ? activePackaging(product) : []
    const steps: PromiseLike<{ error: { message: string } | null }>[] = []
    if (existing.some((x) => x.is_default)) {
      const r = await supabase.from('product_packaging').update({ is_default: false }).eq('product_id', id!).eq('is_default', true)
      if (r.error) return toast.error(friendly(r.error.message))
    }
    for (const x of existing) if (!keepIds.has(x.id)) {
      steps.push(supabase.from('product_packaging').update({ archived_at: new Date().toISOString() }).eq('id', x.id))
    }
    // The extra packaging fields exist only after migration 0012; don't send them before that.
    const hasSpecCols = existing.some((x) => 'units_per_pack' in x) || v.packaging.some((p) => p.variety || p.units_per_pack || p.unit_name || p.unit_weight_g || p.packs_per_container)
    v.packaging.forEach((p, i) => {
      const pr = {
        product_id: id!, label: p.label.trim(), packaging_type: t(p.packaging_type),
        net_weight_kg: n(p.net_weight_kg), gross_weight_kg: n(p.gross_weight_kg),
        length_cm: n(p.length_cm), width_cm: n(p.width_cm), height_cm: n(p.height_cm),
        cartons_per_pallet: n(p.cartons_per_pallet), notes: t(p.notes), is_default: i === v.default_index,
        ...(hasSpecCols ? {
          variety: t(p.variety), units_per_pack: n(p.units_per_pack), unit_name: t(p.unit_name),
          unit_weight_g: n(p.unit_weight_g), packs_per_container: n(p.packs_per_container),
        } : {}),
      }
      steps.push(p.id ? supabase.from('product_packaging').update(pr).eq('id', p.id) : supabase.from('product_packaging').insert(pr))
    })
    const results = await Promise.all(steps)
    const failed = results.find((r) => r.error)
    if (failed?.error) toast.error('Product saved, but packaging failed: ' + friendly(failed.error.message))
    else toast.success(product ? 'Product updated' : 'Product added')
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{product ? product.name : 'Add product'}</DialogTitle>
          <DialogDescription>{canEdit ? 'Leave a field empty if you don’t know it yet.' : 'Read-only for your role.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogBody>
            <fieldset disabled={!canEdit} className="space-y-6">
              <section className="grid gap-4 sm:grid-cols-2">
                <Field label="Product name" htmlFor="name" error={errors.name?.message}><Input id="name" {...register('name')} /></Field>
                <Field label="Category" htmlFor="category_id" error={errors.category_id?.message}>
                  <Select id="category_id" {...register('category_id', {
                    onChange: (e) => { const c = categories.find((x) => x.id === e.target.value); if (c) setValue('product_type', c.product_type) },
                  })}>
                    <option value="">Choose…</option>
                    {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Type" htmlFor="product_type">
                  <Select id="product_type" {...register('product_type')}>
                    {Object.entries(PRODUCT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Varieties" htmlFor="varieties" hint="Separate with commas, e.g. Hass, Fuerte"><Input id="varieties" {...register('varieties')} /></Field>
                <Field label="Origin" htmlFor="origin"><Input id="origin" {...register('origin')} /></Field>
                <Field label="Availability" htmlFor="availability">
                  <Select id="availability" {...register('availability')}>
                    <option value="">Not set</option>
                    {Object.entries(AVAILABILITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Season starts" htmlFor="season_start_month">
                  <Select id="season_start_month" {...register('season_start_month')}>
                    <option value="">Not set</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </Select>
                </Field>
                <Field label="Season ends" htmlFor="season_end_month" error={errors.season_end_month?.message}>
                  <Select id="season_end_month" {...register('season_end_month')}>
                    <option value="">Not set</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </Select>
                </Field>
                <Field label="Size / caliber" htmlFor="size_caliber"><Input id="size_caliber" {...register('size_caliber')} /></Field>
                <Field label="Storage temperature" htmlFor="storage_temperature"><Input id="storage_temperature" placeholder="e.g. -18 °C" {...register('storage_temperature')} /></Field>
                <Field label="Shelf life" htmlFor="shelf_life"><Input id="shelf_life" {...register('shelf_life')} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Min. order" htmlFor="moq_quantity" error={errors.moq_quantity?.message}><Input id="moq_quantity" inputMode="decimal" {...register('moq_quantity')} /></Field>
                  <Field label="Unit" htmlFor="moq_unit"><Input id="moq_unit" placeholder="tons, pallets…" {...register('moq_unit')} /></Field>
                </div>
                <Field label="Specifications" htmlFor="specifications" className="sm:col-span-2"><Textarea id="specifications" {...register('specifications')} /></Field>
                <Field label="Internal notes" htmlFor="notes" className="sm:col-span-2"><Textarea id="notes" {...register('notes')} /></Field>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Packaging</h4>
                    <p className="text-xs text-muted-foreground">The ★ default is used by pricing and the container planner.</p>
                  </div>
                  {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => packs.append(emptyPack)}><Plus />Add packaging</Button>}
                </div>
                {!packs.fields.length && <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No packaging yet.</p>}
                <div className="space-y-3">
                  {packs.fields.map((f, i) => {
                    const e = errors.packaging?.[i]
                    return (
                      <div key={f.id} className="rounded-md border border-border p-3">
                        {i === 0 && <datalist id="pack-varieties">{varietyOptions.map((v) => <option key={v} value={v} />)}</datalist>}
                        <div className="mb-3 flex items-center gap-2">
                          <button type="button" onClick={() => setValue('default_index', i, { shouldDirty: true })}
                            className={i === defaultIndex ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground'}
                            title={i === defaultIndex ? 'Default packaging' : 'Make default'} aria-label="Make default">
                            <Star className="size-4" fill={i === defaultIndex ? 'currentColor' : 'none'} />
                          </button>
                          <Input placeholder="Label, e.g. 4 kg carton" aria-label="Packaging label" {...register(`packaging.${i}.label`)} className="h-8" />
                          {canEdit && (
                            <Button type="button" variant="ghost" size="icon" aria-label="Remove packaging"
                              onClick={() => { packs.remove(i); if (defaultIndex >= i && defaultIndex > 0) setValue('default_index', defaultIndex - 1) }}>
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                        {e?.label && <p className="-mt-2 mb-2 text-xs text-destructive">{e.label.message}</p>}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <Field label="Type" error={e?.packaging_type?.message}><Input placeholder="Carton, bag…" {...register(`packaging.${i}.packaging_type`)} /></Field>
                          <Field label="Net kg" error={e?.net_weight_kg?.message}><Input inputMode="decimal" {...register(`packaging.${i}.net_weight_kg`)} /></Field>
                          <Field label="Gross kg" error={e?.gross_weight_kg?.message}><Input inputMode="decimal" {...register(`packaging.${i}.gross_weight_kg`)} /></Field>
                          <Field label="Cartons / pallet" error={e?.cartons_per_pallet?.message}><Input inputMode="numeric" {...register(`packaging.${i}.cartons_per_pallet`)} /></Field>
                          <Field label="Length cm" error={e?.length_cm?.message}><Input inputMode="decimal" {...register(`packaging.${i}.length_cm`)} /></Field>
                          <Field label="Width cm" error={e?.width_cm?.message}><Input inputMode="decimal" {...register(`packaging.${i}.width_cm`)} /></Field>
                          <Field label="Height cm" error={e?.height_cm?.message}><Input inputMode="decimal" {...register(`packaging.${i}.height_cm`)} /></Field>
                          <Field label="For variety"><Input placeholder="All varieties" list="pack-varieties" {...register(`packaging.${i}.variety`)} /></Field>
                          <Field label="Units / pack" error={e?.units_per_pack?.message}><Input inputMode="numeric" placeholder="e.g. 14" {...register(`packaging.${i}.units_per_pack`)} /></Field>
                          <Field label="Unit"><Input placeholder="bunch, punnet…" {...register(`packaging.${i}.unit_name`)} /></Field>
                          <Field label="Unit weight g" error={e?.unit_weight_g?.message}><Input inputMode="decimal" {...register(`packaging.${i}.unit_weight_g`)} /></Field>
                          <Field label="Packs / container" error={e?.packs_per_container?.message}><Input inputMode="numeric" {...register(`packaging.${i}.packs_per_container`)} /></Field>
                          <Field label="Notes" className="sm:col-span-3"><Input {...register(`packaging.${i}.notes`)} /></Field>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </fieldset>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{canEdit ? 'Cancel' : 'Close'}</Button>
            {canEdit && <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" />}Save</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function friendly(msg: string) {
  if (msg.includes('products_name_type_uq')) return 'A product with this name and type already exists.'
  if (msg.includes('row-level security')) return 'Your role is not allowed to do this.'
  return msg
}
