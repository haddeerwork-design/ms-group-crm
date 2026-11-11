// =====================================================================
// Edge Function: trade-data
// Official trade statistics from UN Comtrade (United Nations), for the
// Market Research page: who imports a product, what a country imports,
// and where each country buys from.
//
// • Free: uses Comtrade's public preview (no key). If you later get a free
//   Comtrade key, add it in Supabase → Edge Functions → Secrets as
//   COMTRADE_KEY and the function uses the full API automatically.
// • Only logged-in employees can call it (keep "Verify JWT" ON).
// • It only reads public data; nothing is saved.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor,
// name it  trade-data , paste this file, Deploy.
// =====================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

export type Query = {
  action?: 'flows' | 'reporters'
  flow?: 'M' | 'X'           // M = imports, X = exports
  reporter?: string | null   // country code (M49); empty = every country
  partner?: string | null    // '0' = the world total; empty = every partner country
  cmd?: string               // HS codes, comma separated (e.g. "080450,080440")
  year?: number
}
export type Row = { reporter: string; reporterCode: number; partner: string; partnerCode: number; cmd: string; cmdDesc: string; value: number | null; kg: number | null; year: number }

const CODE = /^[0-9]{2,6}(,[0-9]{2,6}){0,19}$/
/** Checks the request and builds the Comtrade URL (public preview, or the full API with a key). */
export function buildUrl(q: Query, key?: string): string {
  const flow = q.flow === 'X' ? 'X' : 'M'
  const year = Number(q.year)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Choose a year.')
  if (!q.cmd || !CODE.test(q.cmd)) throw new Error('Choose a product (HS code).')
  const p = new URLSearchParams({ flowCode: flow, period: String(year), cmdCode: q.cmd, includeDesc: 'true' })
  if (q.reporter) { if (!/^[0-9]{1,4}$/.test(q.reporter)) throw new Error('Unknown country.'); p.set('reporterCode', q.reporter) }
  if (q.partner) { if (!/^[0-9]{1,4}$/.test(q.partner)) throw new Error('Unknown partner.'); p.set('partnerCode', q.partner) }
  if (!q.reporter && !q.partner) p.set('partnerCode', '0') // every country, world total
  p.set('motCode', '0'); p.set('customsCode', 'C00'); p.set('partner2Code', '0')
  return key
    ? `https://comtradeapi.un.org/data/v1/get/C/A/HS?${p}`
    : `https://comtradeapi.un.org/public/v1/preview/C/A/HS?${p}`
}

// deno-lint-ignore no-explicit-any
export function trim(data: any[]): Row[] {
  return (data ?? [])
    .filter(Boolean)
    .map((r) => ({
      reporter: r.reporterDesc ?? String(r.reporterCode), reporterCode: Number(r.reporterCode),
      partner: r.partnerDesc ?? String(r.partnerCode), partnerCode: Number(r.partnerCode),
      cmd: String(r.cmdCode), cmdDesc: r.cmdDesc ?? String(r.cmdCode),
      value: typeof r.primaryValue === 'number' ? r.primaryValue : null,
      kg: typeof r.netWgt === 'number' && r.netWgt > 0 ? r.netWgt : null,
      year: Number(r.refYear ?? r.period),
    }))
}

export async function handle(req: Request, fetcher: typeof fetch = fetch, key = Deno.env.get('COMTRADE_KEY') ?? undefined): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST' })
  let q: Query
  try { q = await req.json() } catch { return json(400, { error: 'Bad request' }) }
  try {
    if (q.action === 'reporters') {
      const r = await fetcher('https://comtradeapi.un.org/files/v1/app/reference/Reporters.json')
      if (!r.ok) return json(502, { error: `Comtrade answered ${r.status}` })
      const d = await r.json()
      // deno-lint-ignore no-explicit-any
      const list = (d.results ?? []).filter((x: any) => !x.isGroup && !x.entryExpiredDate).map((x: any) => ({ code: String(x.reporterCode ?? x.id), name: x.reporterDesc ?? x.text }))
      return json(200, { countries: list })
    }
    const url = buildUrl(q, key)
    const r = await fetcher(url, key ? { headers: { 'Ocp-Apim-Subscription-Key': key } } : undefined)
    if (r.status === 429) return json(429, { error: 'Too many searches right now. Wait a minute and try again.' })
    if (!r.ok) return json(502, { error: `Comtrade answered ${r.status}` })
    const d = await r.json()
    if (d.error) return json(502, { error: String(d.error) })
    return json(200, { rows: trim(d.data), source: key ? 'UN Comtrade' : 'UN Comtrade (public preview)', url: url.replace(/subscription-key=[^&]+/, '') })
  } catch (e) {
    return json(400, { error: (e as Error).message })
  }
}

if (import.meta.main) Deno.serve((req) => handle(req))
