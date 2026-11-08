import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { AppRole } from './roles'

export type Profile = { id: string; full_name: string | null; email: string | null; role: string | null }

type AuthState = {
  loading: boolean
  session: Session | null
  profile: Profile | null
  roles: AppRole[]
  error: string | null
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  hasRole: (...r: AppRole[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [error, setError] = useState<string | null>(null)

  async function loadUser(s: Session | null) {
    setSession(s)
    setError(null)
    if (!s) { setProfile(null); setRoles([]); setLoading(false); return }
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role').eq('id', s.user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', s.user.id),
    ])
    if (p.error || r.error) {
      setError((p.error || r.error)!.message)
    } else if (!p.data) {
      setError('Your login works, but there is no employee profile for it. Ask the Super Admin to add you.')
    } else if (!r.data?.length) {
      setError('Your profile has no role in the new platform yet. Ask the Super Admin to assign one.')
    }
    setProfile(p.data ?? null)
    setRoles((r.data ?? []).map((x) => x.role as AppRole))
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => loadUser(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') loadUser(s)
      else setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthState = {
    loading, session, profile, roles, error,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) return null
      return error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message
    },
    async signOut() { await supabase.auth.signOut() },
    hasRole: (...r) => roles.some((x) => r.includes(x)),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
