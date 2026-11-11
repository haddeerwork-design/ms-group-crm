import { describe, expect, it } from 'vitest'
import { createElement as h, Fragment } from 'react'
import { fold, readOptions } from './select'

describe('dropdown options', () => {
  it('reads options, groups, fragments and text-only values', () => {
    const kids = [
      h('option', { key: 'a', value: '' }, 'Choose…'),
      h('optgroup', { key: 'g', label: 'Fruits' }, h('option', { value: 'm' }, 'Mango'), h(Fragment, null, h('option', { value: 'a' }, 'Avocado'))),
      h('option', { key: 'x' }, 'Egypt'),
      false,
    ]
    expect(readOptions(kids)).toEqual([
      { value: '', label: 'Choose…', group: undefined, disabled: false },
      { value: 'm', label: 'Mango', group: 'Fruits', disabled: false },
      { value: 'a', label: 'Avocado', group: 'Fruits', disabled: false },
      { value: 'Egypt', label: 'Egypt', group: undefined, disabled: false },
    ])
  })
  it('search ignores case, accents and Arabic letter forms', () => {
    expect(fold('Türkiye')).toBe('turkiye')
    expect(fold('أفوكادو')).toBe(fold('افوكادو'))
    expect(fold('ليمونة')).toBe(fold('ليمونه'))
  })
})
