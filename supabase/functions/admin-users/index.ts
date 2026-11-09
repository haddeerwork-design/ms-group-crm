// =====================================================================
// Edge Function: admin-users
// Lets the Super Admin add employees and reset their passwords from the app.
//
// SECURITY
//  • Runs on Supabase's servers. The secret (service-role) key is read from
//    Supabase's own environment here and never reaches the browser.
//  • Every call is checked: the caller must be logged in AND hold the
//    super_admin role in user_roles. Everyone else gets 403.
//  • New employees get a random temporary password and must change it at
//    their first login.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor,
// name it  admin-users , paste this file, Deploy. Then in the function's
// Details turn OFF "Verify JWT" (this file verifies the login itself).
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2'

export const ROLES = ['super_admin', 'sales_manager', 'sales_officer', 'logistics_officer', 'finance_officer', 'quality_officer', 'viewer']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** 14 characters, no look-alikes (0/O, 1/l/I), always with upper, lower, digit and symbol. */
export function makePassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*?']
  const all = sets.join('')
  const rnd = (n: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n }
  const chars = sets.map((s) => s[rnd(s.length)])
  while (chars.length < 14) chars.push(all[rnd(all.length)])
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
  return chars.join('')
}

type Env = { url: string; secret: string }
// deno-lint-ignore no-explicit-any
type MakeClient = (url: string, key: string, opts?: any) => any

export async function handle(req: Request, env: Env, mk: MakeClient = createClient): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  if (!env.url || !env.secret) return json(500, { error: 'Server keys are missing in the function environment.' })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Please log in again.' })
  const admin = mk(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: who, error: whoErr } = await admin.auth.getUser(token)
  if (whoErr || !who?.user) return json(401, { error: 'Please log in again.' })
  const caller = who.user.id
  const { data: isSuper } = await admin.from('user_roles').select('role').eq('user_id', caller).eq('role', 'super_admin').maybeSingle()
  if (!isSuper) return json(403, { error: 'Only the Super Admin can manage employees.' })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json(400, { error: 'Bad request.' }) }

  if (body.action === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const fullName = String(body.full_name ?? '').trim().slice(0, 120)
    const roles = Array.isArray(body.roles) ? [...new Set(body.roles.map(String))] : []
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Enter a valid email.' })
    if (!fullName) return json(400, { error: 'Enter the employee name.' })
    if (!roles.length || roles.some((r) => !ROLES.includes(r))) return json(400, { error: 'Choose at least one valid role.' })

    const password = makePassword()
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName, must_change_password: true },
    })
    if (error) return json(/already|registered|exists/i.test(error.message) ? 409 : 400, { error: /already|registered|exists/i.test(error.message) ? 'This email already has an account.' : error.message })
    const id = created.user.id
    const p = await admin.from('profiles').upsert({ id, email, full_name: fullName }, { onConflict: 'id' })
    if (p.error) return json(500, { error: `Account created, but the profile failed: ${p.error.message}`, user_id: id, password })
    const r = await admin.from('user_roles').insert(roles.map((role) => ({ user_id: id, role, granted_by: caller })))
    if (r.error) return json(500, { error: `Account created, but roles failed: ${r.error.message}. Tick them in Team & Roles.`, user_id: id, password })
    return json(200, { user_id: id, email, password })
  }

  if (body.action === 'reset_password') {
    const id = String(body.user_id ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'Bad user.' })
    if (id === caller) return json(400, { error: 'Change your own password from the key button at the top.' })
    const { data: u, error: gErr } = await admin.auth.admin.getUserById(id)
    if (gErr || !u?.user) return json(404, { error: 'Employee not found.' })
    const password = makePassword()
    const { error } = await admin.auth.admin.updateUserById(id, { password, user_metadata: { ...(u.user.user_metadata ?? {}), must_change_password: true } })
    if (error) return json(400, { error: error.message })
    return json(200, { user_id: id, password })
  }

  return json(400, { error: 'Unknown action.' })
}

// Tests import handle() without starting a server.
if (!Deno.env.get('ADMIN_USERS_TEST')) {
  const secrets = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') } catch { return {} } })()
  const env = { url: Deno.env.get('SUPABASE_URL') ?? '', secret: secrets.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' }
  Deno.serve((req) => handle(req, env))
}
