// LOCAL TEST ONLY: ADMIN_USERS_TEST=1 deno test --allow-env --allow-net index.test.ts
function assert(c: unknown, m = 'assertion failed'): asserts c { if (!c) throw new Error(m) }
function assertEquals(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`) }
import { handle, makePassword } from './index.ts'

const SUPER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SALES = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
function fake(log: string[]) {
  return () => ({
    auth: {
      getUser: (t: string) => Promise.resolve(t === 'super' ? { data: { user: { id: SUPER } } } : t === 'sales' ? { data: { user: { id: SALES } } } : { data: { user: null }, error: { message: 'bad' } }),
      admin: {
        createUser: (o: { email: string; password: string }) => { log.push('create ' + o.email + ' ' + o.password.length); return Promise.resolve(o.email === 'taken@x.com' ? { error: { message: 'A user with this email address has already been registered' } } : { data: { user: { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' } } }) },
        getUserById: () => Promise.resolve({ data: { user: { user_metadata: { full_name: 'X' } } } }),
        updateUserById: (_id: string, o: { user_metadata: Record<string, unknown> }) => { log.push('update ' + JSON.stringify(o.user_metadata)); return Promise.resolve({}) },
      },
    },
    from: (t: string) => {
      const q: Record<string, unknown> = {}
      const chain = {
        select: () => chain, eq: (k: string, v: string) => { q[k] = v; return chain },
        maybeSingle: () => Promise.resolve({ data: t === 'user_roles' && q.user_id === SUPER ? { role: 'super_admin' } : null }),
        upsert: (r: unknown) => { log.push('upsert ' + t + ' ' + JSON.stringify(r)); return Promise.resolve({}) },
        insert: (r: unknown) => { log.push('insert ' + t + ' ' + JSON.stringify(r)); return Promise.resolve({}) },
      }
      return chain
    },
  })
}
const env = { url: 'https://x.supabase.co', secret: 's' }
const call = (token: string, body: unknown, log: string[] = []) =>
  handle(new Request('https://f', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), env, fake(log))

Deno.test('password is strong', () => {
  for (let i = 0; i < 200; i++) {
    const p = makePassword()
    assertEquals(p.length, 14)
    assert(/[A-Z]/.test(p) && /[a-z]/.test(p) && /[2-9]/.test(p) && /[!@#$%*?]/.test(p))
    assert(!/[0O1lI]/.test(p))
  }
})
Deno.test('only super admin', async () => {
  assertEquals((await call('sales', { action: 'create' })).status, 403)
  assertEquals((await call('nope', { action: 'create' })).status, 401)
  assertEquals((await handle(new Request('https://f', { method: 'POST' }), env, fake([]))).status, 401)
})
Deno.test('create employee', async () => {
  const log: string[] = []
  const r = await call('super', { action: 'create', email: ' New@MS.com ', full_name: 'New One', roles: ['sales_officer', 'sales_officer'] }, log)
  assertEquals(r.status, 200)
  const b = await r.json()
  assertEquals(b.email, 'new@ms.com'); assertEquals(b.password.length, 14)
  assert(log.some((l) => l.startsWith('insert user_roles') && l.includes('"granted_by":"' + SUPER) && l.split('sales_officer').length === 2))
})
Deno.test('create validation', async () => {
  assertEquals((await call('super', { action: 'create', email: 'bad', full_name: 'x', roles: ['viewer'] })).status, 400)
  assertEquals((await call('super', { action: 'create', email: 'a@b.co', full_name: 'x', roles: ['god'] })).status, 400)
  assertEquals((await call('super', { action: 'create', email: 'a@b.co', full_name: '', roles: ['viewer'] })).status, 400)
  assertEquals((await call('super', { action: 'create', email: 'taken@x.com', full_name: 'x', roles: ['viewer'] })).status, 409)
})
Deno.test('reset password forces change', async () => {
  const log: string[] = []
  const r = await call('super', { action: 'reset_password', user_id: SALES }, log)
  assertEquals(r.status, 200)
  assert(log[0].includes('"must_change_password":true') && log[0].includes('"full_name":"X"'))
  assertEquals((await call('super', { action: 'reset_password', user_id: SUPER })).status, 400)
})
