import { supabase } from './supabase'

export type SampleStatus = 'preparing' | 'sent' | 'delivered' | 'feedback_positive' | 'feedback_negative' | 'no_answer'
export type Sample = {
  id: string; company_id: string; product_id: string | null; product_name: string; quantity: string | null
  sent_date: string; courier: string | null; tracking_no: string | null; status: SampleStatus
  feedback: string | null; feedback_date: string | null; notes: string | null; created_by: string; created_at: string
}

export const SAMPLE_STATUS: Record<SampleStatus, string> = {
  preparing: 'Preparing',
  sent: 'Sent',
  delivered: 'Delivered',
  feedback_positive: 'Liked it',
  feedback_negative: 'Did not like it',
  no_answer: 'No answer',
}
export const SAMPLE_TONE: Record<SampleStatus, string> = {
  preparing: 'border-border text-muted-foreground',
  sent: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  delivered: 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  feedback_positive: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  feedback_negative: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200',
  no_answer: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
}
/** Days after sending before we ask the customer for feedback. */
export const FEEDBACK_AFTER_DAYS = 7

/** Still waiting for the customer's opinion? */
export const awaitingFeedback = (s: Pick<Sample, 'status'>) => s.status === 'sent' || s.status === 'delivered'

/** Courier tracking page, for the couriers Egyptian exporters use most. */
export function trackingUrl(courier: string | null, no: string | null): string | null {
  if (!no?.trim()) return null
  const n = encodeURIComponent(no.trim())
  const c = (courier ?? '').toLowerCase()
  if (c.includes('dhl')) return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id=${n}`
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${n}`
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${n}`
  if (c.includes('aramex')) return `https://www.aramex.com/track/results?ShipmentNumber=${n}`
  return null
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Samples of one company. Returns [] (not an error) before migration 0019 is run. */
export async function fetchSamples(companyId: string): Promise<{ rows: Sample[]; ready: boolean }> {
  const { data, error } = await supabase.from('samples').select('*').eq('company_id', companyId).order('sent_date', { ascending: false })
  if (error) return { rows: [], ready: false }
  return { rows: (data ?? []) as Sample[], ready: true }
}
