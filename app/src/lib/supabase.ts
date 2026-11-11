import { createClient } from '@supabase/supabase-js'
import { config } from '@/config'

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  // pkce: the reset-password link comes back as ?code=… so it works with the #/ page addresses
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})
export const LEGACY_CRM_URL = config.legacyCrmUrl
