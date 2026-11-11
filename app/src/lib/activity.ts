import { supabase } from './supabase'

export type AuditRow = {
  id: number; at: string; actor: string | null; table_name: string; record_id: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null
}

/** Readable names for the tables that keep a history. */
export const AREAS: Record<string, string> = {
  quotations: 'Quotation',
  proforma_invoices: 'Proforma invoice',
  sales_orders: 'Order',
  order_documents: 'Order document',
  order_doc_waivers: 'Document not needed',
  payments: 'Payment',
  product_prices: 'Selling price',
  supplier_prices: 'Supplier price',
  exchange_rates: 'Exchange rate',
  opportunities: 'Deal',
  research_leads: 'Research lead',
  samples: 'Sample',
  container_types: 'Container type',
  company_settings: 'Company settings',
  user_roles: 'User role',
}
export const ACTION_VERB = { INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Deleted' } as const

// technical fields nobody needs to read in the history
const HIDDEN = new Set(['id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'search', 'legacy_key', 'storage_path'])

/** A short name for the changed record: its number, name or title. */
export function recordLabel(r: Pick<AuditRow, 'table_name' | 'old_data' | 'new_data' | 'record_id'>): string {
  const d = { ...(r.old_data ?? {}), ...(r.new_data ?? {}) } as Record<string, unknown>
  const s = (k: string) => (d[k] == null || d[k] === '' ? null : String(d[k]))
  if (r.table_name === 'exchange_rates') return `${s('base_currency')} → ${s('quote_currency')}`
  if (r.table_name === 'user_roles') return s('role') ?? ''
  if (r.table_name === 'order_doc_waivers' || r.table_name === 'order_documents') return (s('doc_type') ?? '').replace(/_/g, ' ')
  return s('number') ?? s('name') ?? s('title') ?? s('product_name') ?? s('company_name') ?? s('reference') ?? s('file_name') ?? (r.record_id ? `#${r.record_id.slice(0, 8)}` : '')
}

/** Where to open the record in the app, when there is a page for it. */
export function recordLink(r: Pick<AuditRow, 'table_name' | 'old_data' | 'new_data' | 'record_id' | 'action'>): string | null {
  if (r.action === 'DELETE') return null
  const d = (r.new_data ?? {}) as Record<string, unknown>
  const id = r.record_id
  switch (r.table_name) {
    case 'quotations': return id ? `/quotations/${id}` : null
    case 'proforma_invoices': return id ? `/proformas/${id}` : null
    case 'sales_orders': return id ? `/orders/${id}` : null
    case 'order_documents': case 'order_doc_waivers': case 'payments': return d.order_id ? `/orders/${d.order_id}` : null
    case 'samples': case 'opportunities': return d.company_id ? `/crm/${d.company_id}` : null
    default: return null
  }
}

const show = (v: unknown): string => {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16).replace('T', ' ') : s
}
export const fieldLabel = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** What changed, field by field (only fields that really changed, without technical ones). */
export function diff(r: Pick<AuditRow, 'action' | 'old_data' | 'new_data'>): { field: string; before: string; after: string }[] {
  const o = r.old_data ?? {}, n = r.new_data ?? {}
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !HIDDEN.has(k))
  return keys
    .filter((k) => r.action !== 'UPDATE' || JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .filter((k) => r.action === 'UPDATE' || (r.action === 'INSERT' ? n[k] != null && n[k] !== '' : o[k] != null && o[k] !== ''))
    .map((k) => ({ field: fieldLabel(k), before: r.action === 'INSERT' ? '' : show(o[k]), after: r.action === 'DELETE' ? '' : show(n[k]) }))
}

export const PAGE = 50
export async function fetchActivity(f: { area?: string; actor?: string; action?: string; since?: string; before?: number }) {
  let q = supabase.from('audit_logs').select('*').order('id', { ascending: false }).limit(PAGE)
  if (f.area) q = q.eq('table_name', f.area)
  if (f.actor) q = q.eq('actor', f.actor)
  if (f.action) q = q.eq('action', f.action)
  if (f.since) q = q.gte('at', f.since)
  if (f.before) q = q.lt('id', f.before)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AuditRow[]
}
