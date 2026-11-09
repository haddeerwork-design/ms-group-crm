import { supabase } from './supabase'

/** Calls the admin-users Edge Function (Super Admin only; checked again on the server). */
export async function adminUsers<T = { user_id: string; password: string; email?: string }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    // Show the function's own message when there is one.
    const res = (error as { context?: Response }).context
    let msg = error.message
    if (res && typeof res.json === 'function') { try { const j = await res.clone().json(); if (j?.error) msg = j.error } catch { /* not JSON */ } }
    if (/Failed to send a request|not found|404/i.test(msg)) msg = 'The admin-users function is not set up yet in Supabase (Edge Functions).'
    throw new Error(msg)
  }
  return data as T
}
