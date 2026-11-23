import { describe, expect, it } from 'vitest'
import { countryFromText, countryName, countryOptions } from './places'

describe('countries', () => {
  it('reads what people type', () => {
    expect(countryFromText('Saudi Arabia')).toBe('SA')
    expect(countryFromText('السعودية')).toBe('SA')
    expect(countryFromText('KSA')).toBe('SA')
    expect(countryFromText('United Arab Emirates')).toBe('AE')
    expect(countryFromText('UAE')).toBe('AE')
    expect(countryFromText('eg')).toBe('EG')
    expect(countryFromText('Narnia')).toBeNull()
    expect(countryFromText('')).toBeNull()
  })
  it('names in English and Arabic', () => {
    expect(countryName('EG')).toBe('Egypt')
    expect(countryName('EG', 'ar')).toBe('مصر')
    const list = countryOptions()
    expect(list.length).toBeGreaterThan(150)
    expect(list.find((c) => c.code === 'AE')?.name).toBe('United Arab Emirates')
  })
})
