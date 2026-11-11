import { describe, expect, it } from 'vitest'
import { duplicateGroups, normName, suggestKeep } from './duplicates'
import type { Product } from './catalog'

const p = (name: string, extra: Partial<Product> = {}): Product => ({
  id: name, category_id: 'c', name, product_type: 'fresh', varieties: [], origin: null, season_start_month: null, season_end_month: null,
  availability: null, specifications: null, size_caliber: null, storage_temperature: null, shelf_life: null, moq_quantity: null, moq_unit: null,
  notes: null, legacy_key: null, archived_at: null, updated_at: '', product_packaging: [], ...extra,
})

describe('duplicate products', () => {
  it('normalises plurals, CRM suffixes and type words', () => {
    expect(normName('Strawberries')).toBe('strawberry')
    expect(normName('Strawberry (from CRM p12)')).toBe('strawberry')
    expect(normName('Sweet Potatoes')).toBe('sweet potato')
    expect(normName('Passion Fruit Jam')).toBe('passion fruit')
    expect(normName('Grass')).toBe('grass')
  })
  it('groups only the same type and skips archived', () => {
    const g = duplicateGroups([p('Mango'), p('Mangoes'), p('Mango', { id: 'fz', product_type: 'frozen' }), p('Mangos', { id: 'old', archived_at: 'x' }), p('Guava')])
    expect(g.map((x) => x.map((y) => y.id))).toEqual([['Mango', 'Mangoes']])
  })
  it('keeps the one without "(from CRM)" and with more packing', () => {
    const pk = { id: 'k', archived_at: null } as never
    expect(suggestKeep([p('Lemon (from CRM p1)', { product_packaging: [pk, pk] }), p('Lemons')]).name).toBe('Lemons')
    expect(suggestKeep([p('Lemon'), p('Lemons', { product_packaging: [pk] })]).name).toBe('Lemons')
  })
})
