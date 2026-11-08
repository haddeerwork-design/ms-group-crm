import { createClient } from '@supabase/supabase-js'
import { config } from '@/config'

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
export const LEGACY_CRM_URL = config.legacyCrmUrl
