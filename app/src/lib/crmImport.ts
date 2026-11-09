// Pure helpers for importing companies from CSV / Excel. Covered by crmImport.test.ts.
import { COMPANY_TYPE, LEAD_STATUS, PRIORITY } from './crm'

export const IMPORT_FIELDS = [
  { key: 'name', label: 'Company name', required: true, synonyms: ['company', 'company name', 'name', 'importer', 'customer', 'الشركة', 'اسم الشركة'] },
  { key: 'country', label: 'Country', synonyms: ['country', 'البلد', 'الدولة'] },
  { key: 'city', label: 'City', synonyms: ['city', 'المدينة'] },
  { key: 'website', label: 'Website', synonyms: ['website', 'web', 'site', 'url', 'الموقع'] },
  { key: 'company_type', label: 'Company type', synonyms: ['type', 'company type', 'business type'] },
  { key: 'contact_name', label: 'Contact person', synonyms: ['contact', 'contact person', 'contact name', 'person', 'المسؤول'] },
  { key: 'job_title', label: 'Job title', synonyms: ['job', 'job title', 'title', 'position'] },
  { key: 'email', label: 'Email', synonyms: ['email', 'e-mail', 'mail', 'الايميل', 'البريد'] },
  { key: 'phone', label: 'Phone', synonyms: ['phone', 'tel', 'telephone', 'mobile', 'التليفون', 'الهاتف'] },
  { key: 'whatsapp', label: 'WhatsApp', synonyms: ['whatsapp', 'wa', 'واتساب'] },
  { key: 'linkedin', label: 'LinkedIn', synonyms: ['linkedin'] },
  { key: 'products_interested', label: 'Products interested in', synonyms: ['products', 'products interested', 'interested in', 'المنتجات'] },
  { key: 'estimated_volume', label: 'Estimated volume', synonyms: ['volume', 'estimated volume', 'monthly volume'] },
  { key: 'lead_source', label: 'Lead source', synonyms: ['source', 'lead source'] },
  { key: 'lead_status', label: 'Status', synonyms: ['status', 'lead status', 'stage'] },
  { key: 'priority', label: 'Priority', synonyms: ['priority'] },
  { key: 'notes', label: 'Notes', synonyms: ['notes', 'note', 'comments', 'ملاحظات'] },
] as const
export type ImportKey = (typeof IMPORT_FIELDS)[number]['key']
export type Mapping = Partial<Record<ImportKey, number>> // field → column index

const clean = (s: string) => s.toLowerCase().replace(/[_\-.:]+/g, ' ').replace(/\s+/g, ' ').trim()

export function autoMap(headers: string[]): Mapping {
  const m: Mapping = {}
  const used = new Set<number>()
  for (const f of IMPORT_FIELDS) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && (f.synonyms as readonly string[]).some((s) => clean(s) === clean(h)))
    if (i >= 0) { m[f.key] = i; used.add(i) }
  }
  return m
}

function matchEnum<T extends Record<string, string>>(v: string, map: T): keyof T | null {
  const c = clean(v)
  if (!c) return null
  for (const [k, label] of Object.entries(map)) if (clean(k) === c || clean(label) === c) return k as keyof T
  if (map === (COMPANY_TYPE as unknown) && /food service|restaurant|hotel/.test(c)) return 'horeca' as keyof T
  return null
}

export type ParsedRow = {
  line: number                      // row number in the file (1 = header)
  values: Partial<Record<ImportKey, string>>
  errors: string[]
  warnings: string[]
  fileDuplicateOf: number | null    // earlier line in the same file
}

export function buildRows(rows: string[][], mapping: Mapping): ParsedRow[] {
  const out: ParsedRow[] = []
  const seen = new Map<string, number>()
  rows.forEach((r, i) => {
    const line = i + 2
    if (r.every((c) => !String(c ?? '').trim())) return
    const values: ParsedRow['values'] = {}
    for (const f of IMPORT_FIELDS) {
      const idx = mapping[f.key]
      if (idx != null) { const v = String(r[idx] ?? '').trim(); if (v) values[f.key] = v }
    }
    const errors: string[] = [], warnings: string[] = []
    if (!values.name) errors.push('Company name is empty')
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.push(`Email “${values.email}” is not valid`)
    if (values.company_type && !matchEnum(values.company_type, COMPANY_TYPE)) { warnings.push(`Unknown company type “${values.company_type}” — left empty`); delete values.company_type }
    if (values.lead_status && !matchEnum(values.lead_status, LEAD_STATUS)) { warnings.push(`Unknown status “${values.lead_status}” — set to New Lead`); delete values.lead_status }
    if (values.priority && !matchEnum(values.priority, PRIORITY)) { warnings.push(`Unknown priority “${values.priority}” — set to Medium`); delete values.priority }
    const key = [values.name?.toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, ''), values.email?.toLowerCase()].join('|')
    let fileDuplicateOf: number | null = null
    if (values.name) { if (seen.has(key)) fileDuplicateOf = seen.get(key)!; else seen.set(key, line) }
    out.push({ line, values, errors, warnings, fileDuplicateOf })
  })
  return out
}

/** Converts a parsed row into a companies insert + an optional contact. */
export function toInsert(v: ParsedRow['values']) {
  const company = {
    name: v.name!, country: v.country ?? null, city: v.city ?? null, website: v.website ?? null,
    company_type: v.company_type ? matchEnum(v.company_type, COMPANY_TYPE) : null,
    email: v.email ?? null, phone: v.phone ?? null, whatsapp: v.whatsapp ?? null, linkedin: v.linkedin ?? null,
    products_interested: v.products_interested ?? null, estimated_volume: v.estimated_volume ?? null, lead_source: v.lead_source ?? 'Import',
    lead_status: (v.lead_status ? matchEnum(v.lead_status, LEAD_STATUS) : null) ?? 'new_lead',
    priority: (v.priority ? matchEnum(v.priority, PRIORITY) : null) ?? 'medium',
    notes: v.notes ?? null,
  }
  const contact = v.contact_name ? { name: v.contact_name, job_title: v.job_title ?? null, email: v.email ?? null, phone: v.phone ?? null, whatsapp: v.whatsapp ?? null, linkedin: v.linkedin ?? null, is_primary: true } : null
  return { company, contact }
}
