import { supabase } from './supabase'
import type { Incoterm } from './pricing'

export const LEAD_STATUS = {
  new_lead: 'New Lead', contacted: 'Contacted', interested: 'Interested', quotation_sent: 'Quotation Sent',
  sample_requested: 'Sample Requested', negotiating: 'Negotiating', active_customer: 'Active Customer', inactive: 'Inactive', lost: 'Lost',
} as const
export type LeadStatus = keyof typeof LEAD_STATUS
export const STATUS_TONE: Record<LeadStatus, string> = {
  new_lead: 'bg-muted text-muted-foreground border-border',
  contacted: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900',
  interested: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900',
  quotation_sent: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900',
  sample_requested: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900',
  negotiating: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900',
  active_customer: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900',
  inactive: 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700',
  lost: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900',
}
export const COMPANY_TYPE = { importer: 'Importer', distributor: 'Distributor', wholesaler: 'Wholesaler', retailer: 'Retailer', horeca: 'HORECA', other: 'Other' } as const
export const PRIORITY = { high: 'High', medium: 'Medium', low: 'Low' } as const
export const CONTACT_METHOD = { email: 'Email', whatsapp: 'WhatsApp', phone: 'Phone', linkedin: 'LinkedIn', other: 'Other' } as const
export const ACTIVITY_KIND = { note: 'Note', call: 'Call', email: 'Email', whatsapp: 'WhatsApp', meeting: 'Meeting', quotation: 'Quotation', sample: 'Sample', status: 'Status change', other: 'Other' } as const

export type Company = {
  id: string; name: string; country: string | null; city: string | null; address: string | null; website: string | null
  company_type: keyof typeof COMPANY_TYPE | null; business_description: string | null; email: string | null; phone: string | null
  whatsapp: string | null; linkedin: string | null; preferred_contact: keyof typeof CONTACT_METHOD | null
  products_interested: string | null; product_category: string | null; current_supplier: string | null; current_supplier_country: string | null
  estimated_volume: string | null; packaging_requirements: string | null; target_market: string | null
  preferred_incoterm: Incoterm | null; preferred_payment_terms: string | null; lead_source: string | null
  lead_status: LeadStatus; priority: keyof typeof PRIORITY; last_contact_date: string | null; next_follow_up_date: string | null
  notes: string | null; tags: string[]; owner_id: string | null; legacy_key: string | null; archived_at: string | null
  created_at: string; updated_at: string
}
export type Contact = { id: string; company_id: string; name: string; job_title: string | null; email: string | null; phone: string | null; whatsapp: string | null; linkedin: string | null; is_primary: boolean; notes: string | null }
export type Activity = { id: string; company_id: string; kind: keyof typeof ACTIVITY_KIND; summary: string; happened_at: string; created_by: string | null }
export type TeamMember = { id: string; name: string; email: string | null }
export type DuplicateHit = { idx: number; company_id: string; company_name: string; country: string | null; owner_name: string; reasons: string[]; can_open: boolean; archived: boolean }
export type DupCandidate = { name?: string | null; website?: string | null; email?: string | null; phone?: string | null; country?: string | null; exclude_id?: string | null }

export async function fetchCompanies() {
  const { data, error } = await supabase.from('companies').select('*').order('name')
  if (error) throw error
  return (data ?? []) as Company[]
}
export async function fetchTeam() {
  const { data, error } = await supabase.rpc('list_sales_team')
  if (error) throw error
  return (data ?? []) as TeamMember[]
}
export async function findDuplicates(candidates: DupCandidate[]) {
  if (!candidates.length) return [] as DuplicateHit[]
  const { data, error } = await supabase.rpc('find_company_duplicates', { candidates })
  if (error) throw error
  return (data ?? []) as DuplicateHit[]
}
export async function fetchCompanyDetail(id: string) {
  const [c, ct, ac, q] = await Promise.all([
    supabase.from('companies').select('*').eq('id', id).single(),
    supabase.from('company_contacts').select('*').eq('company_id', id).order('is_primary', { ascending: false }).order('name'),
    supabase.from('activities').select('*').eq('company_id', id).order('happened_at', { ascending: false }),
    supabase.from('quotations').select('id, number, status, version, issue_date, currency, incoterm').eq('company_id', id).order('created_at', { ascending: false }),
  ])
  for (const r of [c, ct, ac, q]) if (r.error) throw r.error
  return { company: c.data as Company, contacts: (ct.data ?? []) as Contact[], activities: (ac.data ?? []) as Activity[], quotations: q.data ?? [] }
}

export const todayISO = () => new Date().toISOString().slice(0, 10)
export function followUpState(d: string | null): 'overdue' | 'today' | 'soon' | null {
  if (!d) return null
  const t = todayISO()
  if (d < t) return 'overdue'
  if (d === t) return 'today'
  const in7 = new Date(); in7.setDate(in7.getDate() + 7)
  return d <= in7.toISOString().slice(0, 10) ? 'soon' : null
}

/** CSV export (Excel opens it). Values are quoted; formulas are neutralised. */
export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const cell = (v: unknown) => {
    let s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return '﻿' + [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n')
}
export function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
