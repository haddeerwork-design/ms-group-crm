import { describe, expect, it } from 'vitest'
import { translate } from './i18n'
import { AR } from './i18n-ar'

describe('interface language', () => {
  it('English is the key; Arabic from the dictionary; unknown text stays as is', () => {
    expect(translate('en', 'Save')).toBe('Save')
    expect(translate('ar', 'Save')).toBe('حفظ')
    expect(translate('ar', 'Keitt Mango')).toBe('Keitt Mango')
  })
  it('fills {placeholders} in both languages', () => {
    expect(translate('en', 'Step {n} of {total}', { n: 2, total: 6 })).toBe('Step 2 of 6')
    expect(translate('ar', 'Step {n} of {total}', { n: 2, total: 6 })).toBe('خطوة 2 من 6')
  })
  it('every Arabic text keeps the same placeholders as its English key', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
    const bad = Object.entries(AR).filter(([en, ar]) => ph(en) !== ph(ar)).map(([en]) => en)
    expect(bad).toEqual([])
  })
})
