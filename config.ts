// Public configuration. These values are SAFE to be public: the publishable
// key only works together with the Row Level Security policies in Supabase.
// NEVER put the service_role / secret key in this file or anywhere in /app.
export const config = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string) || 'https://dfznsxuxwwexkkghmsbz.supabase.co',
  supabaseKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'sb_publishable_Bnt4qwTf0Ki_2hOXj1o-Kw_OX4EmPbW',
  legacyCrmUrl: (import.meta.env.VITE_LEGACY_CRM_URL as string) || 'https://haddeerwork-design.github.io/ms-group-crm/',
}
