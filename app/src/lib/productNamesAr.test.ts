import { describe, expect, it } from 'vitest'
import { arabicProductName as ar } from './productNamesAr'

describe('arabicProductName', () => {
  it('translates the products in the catalog', () => {
    expect(ar('Pomegranates')).toBe('رمان')
    expect(ar('Dry Onions')).toBe('بصل جاف')
    expect(ar('Strawberry')).toBe('فراولة')
    expect(ar('Passion Fruit')).toBe('باشن فروت')
    expect(ar('Barhi Dates')).toBe('بلح برحي')
    expect(ar('Passion Fruit Jam')).toBe('مربى باشن فروت')
    expect(ar('Dragon Fruit & Strawberry Jam')).toBe('مربى دراجون فروت وفراولة')
    expect(ar('Passion Lemon Jam')).toBe('مربى باشن فروت وليمون')
    expect(ar('Navel Oranges')).toBe('برتقال أبو سرة')
    expect(ar('Mixed Vegetables')).toBe('خضروات مشكلة')
    expect(ar('Habanero Peppers')).toBe('فلفل هابانيرو')
    expect(ar('Spring Onions')).toBe('بصل أخضر')
    expect(ar('Iceberg Lettuce')).toBe('خس آيسبرج')
    expect(ar('Sweet Potatoes')).toBe('بطاطا')
    expect(ar('Green Beans')).toBe('فاصوليا خضراء')
    expect(ar('Keitt Mango')).toBe('مانجو كيت')
    expect(ar('Lemons (from CRM p99)')).toBe('ليمون')
    expect(ar('Molokhia')).toBe('ملوخية')
    expect(ar('Cherimoya')).toBe('قشطة')
  })
  it('handles frozen / dried', () => {
    expect(ar('Frozen Strawberries')).toBe('فراولة مجمدة')
    expect(ar('IQF Mango')).toBe('مانجو مجمد')
    expect(ar('Dried Dates')).toBe('بلح مجفف')
  })
  it('gives nothing when a word is unknown', () => {
    expect(ar('Zorblax Fruit')).toBeNull()
    expect(ar('')).toBeNull()
  })
})
