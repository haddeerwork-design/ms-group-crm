// Smoke test: opens every page of the built app (vite preview) as each role, with a FAKE
// Supabase (no network, no real data), and fails if any page crashes or a guarded page opens
// for a role that must not see it.  Run: npm run build && npm run e2e
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const BASE = 'http://localhost:4174/ms-group-crm/app/'
const uid = '00000000-0000-0000-0000-00000000000a'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'smoke@test.local', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' }
const session = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: uid, exp: now + 3600, role: 'authenticated' })}.sig`, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r', user }

const PAGES = ['', 'reports', 'research', 'crm', 'pipeline', 'tasks', 'products', 'pricing', 'planner', 'quotations', 'quotations/new', 'proformas', 'orders', 'payments', 'logistics', 'suppliers', 'team', 'settings', 'archive', 'help']
// role -> pages that must redirect to the dashboard
const BLOCKED = { super_admin: [], sales_officer: ['team'], logistics_officer: ['crm', 'pipeline', 'quotations', 'quotations/new', 'proformas', 'research', 'payments', 'team'],
  viewer: ['crm', 'pipeline', 'quotations', 'quotations/new', 'proformas', 'orders', 'payments', 'research', 'reports', 'team', 'planner'] }

const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
let failed = 0
try {
  // every page for every role, in English and in Arabic (RTL)
  for (const [roleKey, blocked] of [...Object.entries(BLOCKED), ...Object.entries(BLOCKED).map(([r, b]) => [r + ':ar', b])]) {
    const role = roleKey.replace(':ar', '')
    const ctx = await browser.newContext()
    await ctx.addInitScript(([k, v, ar]) => { localStorage.setItem(k, v); localStorage.setItem('ms_lang', ar ? 'ar' : 'en') }, ['sb-dfznsxuxwwexkkghmsbz-auth-token', JSON.stringify(session), roleKey.endsWith(':ar')])
    await ctx.route('**/*supabase.co/**', (route) => {
      const req = route.request(); const u = new URL(req.url()); const t = u.pathname.split('/').pop()
      if (u.pathname.startsWith('/auth/v1/user')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) })
      const single = (req.headers().accept || '').includes('vnd.pgrst.object')
      const rows = { profiles: [{ id: uid, full_name: 'Smoke', email: user.email, role: null }], user_roles: [{ user_id: uid, role }], company_settings: [{ id: 1, company_name: 'MS El-brancy Group', policy_templates: [] }] }[t] ?? []
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(single ? rows[0] ?? null : rows) })
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    for (const p of PAGES) {
      errors.length = 0
      await page.goto(BASE + '#/' + p)
      await page.waitForTimeout(400)
      const hash = new URL(page.url()).hash
      const redirected = hash === '#/' && p !== ''
      const shouldBlock = blocked.includes(p)
      if (errors.length) { failed++; console.log(`FAIL ${roleKey} /${p}: ${errors[0]}`) }
      else if (shouldBlock !== redirected) { failed++; console.log(`FAIL ${roleKey} /${p}: ${shouldBlock ? 'opened but should be blocked' : 'was blocked'}`) }
      else console.log(`ok   ${roleKey} /${p}`)
    }
    await ctx.close()
  }
} finally {
  await browser.close(); server.kill()
}
if (failed) { console.log(`${failed} failure(s)`); process.exit(1) }
console.log('Smoke test passed')
