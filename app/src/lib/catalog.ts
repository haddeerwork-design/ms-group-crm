import { supabase } from './supabase'

export type ProductType = 'fresh' | 'frozen' | 'jam'
export type Availability = 'available' | 'coming_soon' | 'out_of_season' | 'limited' | 'discontinued'

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = { fresh: 'Fresh', frozen: 'Frozen', jam: 'Jam' }
export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Available', coming_soon: 'Coming Soon', out_of_season: 'Out of Season',
  limited: 'Limited Availability', discontinued: 'Discontinued',
}
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type Category = { id: string; name: string; product_type: ProductType; sort_order: number; archived_at: string | null }

export type Packaging = {
  id: string; product_id: string; label: string; packaging_type: string | null
  net_weight_kg: number | null; gross_weight_kg: number | null
  length_cm: number | null; width_cm: number | null; height_cm: number | null
  cartons_per_pallet: number | null; is_default: boolean; notes: string | null; archived_at: string | null
  // added in 0012 (may be missing before that migration runs)
  variety?: string | null; units_per_pack?: number | null; unit_name?: string | null
  unit_weight_g?: number | null; packs_per_container?: number | null
}

export type Product = {
  id: string; category_id: string; name: string; product_type: ProductType; varieties: string[]
  origin: string | null; season_start_month: number | null; season_end_month: number | null
  availability: Availability | null; specifications: string | null; size_caliber: string | null
  storage_temperature: string | null; shelf_life: string | null; moq_quantity: number | null; moq_unit: string | null
  notes: string | null; legacy_key: string | null; archived_at: string | null; updated_at: string
  name_ar?: string | null // from 0014
  image_path?: string | null // from 0019
  product_packaging: Packaging[]
}

export async function fetchCatalog() {
  const [c, p] = await Promise.all([
    supabase.from('product_categories').select('*').order('sort_order').order('name'),
    supabase.from('products').select('*, product_packaging(*)').order('name'),
  ])
  if (c.error) throw c.error
  if (p.error) throw p.error
  return { categories: (c.data ?? []) as Category[], products: (p.data ?? []) as Product[] }
}

export function activePackaging(p: Product) {
  return p.product_packaging
    .filter((x) => !x.archived_at)
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.label.localeCompare(b.label))
}

/** Months (1–12) covered by a season, wrapping over the new year (e.g. Nov→Mar). */
export function seasonMonths(start: number | null, end: number | null): Set<number> {
  const s = new Set<number>()
  if (!start || !end) return s
  let m = start
  for (let i = 0; i < 12; i++) { s.add(m); if (m === end) break; m = (m % 12) + 1 }
  return s
}

export function seasonLabel(p: Pick<Product, 'season_start_month' | 'season_end_month'>) {
  if (!p.season_start_month || !p.season_end_month) return null
  if (seasonMonths(p.season_start_month, p.season_end_month).size === 12) return 'All year'
  return `${MONTHS[p.season_start_month - 1]} – ${MONTHS[p.season_end_month - 1]}`
}

/** What is still missing before a product can be used in pricing / container planning. */
export function missingSetup(p: Product): string[] {
  const pk = activePackaging(p)[0]
  const m: string[] = []
  if (!pk) m.push('packaging')
  else {
    if (!pk.net_weight_kg) m.push('net weight')
    if (!pk.cartons_per_pallet) m.push('cartons/pallet')
  }
  return m
}

export const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d })

/** Packing that fits a variety: ones made for that variety first, then the ones for all varieties. */
export function packsFor(p: Product, variety?: string | null) {
  const all = activePackaging(p)
  const v = (variety ?? '').trim().toLowerCase()
  if (!v) return all
  const own = all.filter((x) => (x.variety ?? '').trim().toLowerCase() === v)
  const general = all.filter((x) => !(x.variety ?? '').trim())
  return [...own, ...general]
}
export const packOptionLabel = (pk: Packaging) => `${pk.label}${pk.variety ? ` · ${pk.variety}` : ''}${pk.is_default ? ' ★' : ''}`

/** Public link of a product photo (bucket "product-images", from migration 0019). */
export const productImageUrl = (path: string | null | undefined) =>
  path ? supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl : null

/** Phone photos are big: shrink to at most `max` px on the long side before uploading. */
export async function shrinkImage(file: File, max = 1400): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choose a JPG, PNG or WebP photo.')
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  if (k === 1 && file.size < 900_000) return file
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height) // transparent PNGs get a white background
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.86))
}

/** Uploads a new photo for a product and removes the old one. */
export async function saveProductPhoto(productId: string, file: File | null, oldPath: string | null | undefined): Promise<string | null> {
  let path: string | null = null
  if (file) {
    const blob = await shrinkImage(file)
    path = `${productId}/${Date.now()}.jpg`
    const up = await supabase.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (up.error) throw new Error(/bucket not found/i.test(up.error.message) ? 'Run migration 0019_docs_samples_photos first.' : up.error.message)
  }
  const { error } = await supabase.from('products').update({ image_path: path }).eq('id', productId)
  if (error) {
    if (path) await supabase.storage.from('product-images').remove([path])
    throw new Error(/image_path/.test(error.message) ? 'Run migration 0019_docs_samples_photos first.' : error.message)
  }
  if (oldPath && oldPath !== path) await supabase.storage.from('product-images').remove([oldPath])
  return path
}
