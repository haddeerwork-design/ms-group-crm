import { describe, expect, it } from 'vitest'
import { autoMap, buildRows, toInsert } from './crmImport'
import { followUpState, toCSV } from './crm'

describe('import mapping', () => {
  it('maps common English and Arabic headers', () => {
    const m = autoMap(['Company Name', 'Country', 'E-mail', 'Contact Person', 'Mobile', 'Products', 'الملاحظات', 'ملاحظات'])
    expect(m).toMatchObject({ name: 0, country: 1, email: 2, contact_name: 3, phone: 4, products_interested: 5, notes: 7 })
  })
})

describe('row validation', () => {
  const rows = [
    ['Gulf Fresh', 'UAE', 'ahmed@gulf.ae', 'Ahmed', 'importer', 'Hot lead', 'HIGH'],
    ['', 'Egypt', '', '', '', '', ''],
    ['Bad Mail Co', 'UK', 'not-an-email', '', 'Food Service', 'Negotiating', ''],
    ['gulf fresh', 'UAE', 'AHMED@gulf.ae', '', '', '', ''],
    ['', '', '', '', '', '', ''],
  ]
  const m = { name: 0, country: 1, email: 2, contact_name: 3, company_type: 4, lead_status: 5, priority: 6 }
  const r = buildRows(rows, m)
  it('skips empty lines and keeps file line numbers', () => {
    expect(r.map((x) => x.line)).toEqual([2, 3, 4, 5])
  })
  it('flags missing names and bad emails as errors', () => {
    expect(r[1].errors).toContain('Company name is empty')
    expect(r[2].errors[0]).toMatch(/not valid/)
  })
  it('unknown values become warnings with safe defaults', () => {
    expect(r[0].warnings[0]).toMatch(/Unknown status/)
    const ins = toInsert(r[0].values)
    expect(ins.company.lead_status).toBe('new_lead')
    expect(ins.company.priority).toBe('high')
    expect(ins.company.company_type).toBe('importer')
    expect(ins.contact?.name).toBe('Ahmed')
    expect(toInsert(r[2].values).company.company_type).toBe('horeca')
    expect(toInsert(r[2].values).company.lead_status).toBe('negotiating')
  })
  it('detects duplicates inside the same file', () => {
    expect(r[3].fileDuplicateOf).toBe(2)
  })
})

describe('helpers', () => {
  it('CSV neutralises formulas and quotes values', () => {
    const csv = toCSV([{ a: '=HYPERLINK("x")', b: 'He said "hi"', c: ['x', 'y'] }])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"He said ""hi"""')
    expect(csv).toContain('"x; y"')
  })
  it('follow-up state', () => {
    expect(followUpState('2000-01-01')).toBe('overdue')
    expect(followUpState(null)).toBeNull()
    expect(followUpState(new Date().toISOString().slice(0, 10))).toBe('today')
  })
})
