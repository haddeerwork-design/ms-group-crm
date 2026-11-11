// LOCAL TEST ONLY: deno test --allow-env index.test.ts
function assert(c: unknown, m = 'assertion failed'): asserts c { if (!c) throw new Error(m) }
function assertEquals(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`) }
import { buildUrl, handle, trim } from './index.ts'

const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })

Deno.test('builds the public preview URL; world total when no country is given', () => {
  const u = new URL(buildUrl({ flow: 'M', cmd: '080450', year: 2023 }))
  assertEquals(u.pathname, '/public/v1/preview/C/A/HS')
  assertEquals([u.searchParams.get('flowCode'), u.searchParams.get('partnerCode'), u.searchParams.get('reporterCode'), u.searchParams.get('cmdCode')], ['M', '0', null, '080450'])
  const k = new URL(buildUrl({ flow: 'X', reporter: '818', cmd: '0804,0805', year: 2023 }, 'KEY'))
  assertEquals(k.pathname, '/data/v1/get/C/A/HS')
  assertEquals(k.searchParams.get('partnerCode'), null) // by partner
})

Deno.test('rejects bad input (no injection into the URL)', () => {
  for (const q of [{ cmd: 'abc', year: 2023 }, { cmd: '0804', year: 1990 }, { cmd: '0804', year: 2023, reporter: '1;x' }]) {
    let threw = false
    try { buildUrl(q as never) } catch { threw = true }
    assert(threw, JSON.stringify(q))
  }
})

Deno.test('trims rows to what the page needs', () => {
  const rows = trim([{ reporterCode: 784, reporterDesc: 'United Arab Emirates', partnerCode: 818, partnerDesc: 'Egypt', cmdCode: '080450', cmdDesc: 'Guavas, mangoes', primaryValue: 1200000, netWgt: 800000, refYear: 2023 }])
  assertEquals(rows[0], { reporter: 'United Arab Emirates', reporterCode: 784, partner: 'Egypt', partnerCode: 818, cmd: '080450', cmdDesc: 'Guavas, mangoes', value: 1200000, kg: 800000, year: 2023 })
})

Deno.test('handle: passes Comtrade data through, reports errors clearly', async () => {
  let called = ''
  const ok = (async (u: string) => { called = u; return new Response(JSON.stringify({ data: [{ reporterCode: 682, partnerCode: 0, cmdCode: '080440', primaryValue: 5, netWgt: 2, refYear: 2023 }] })) }) as unknown as typeof fetch
  const r = await handle(post({ flow: 'M', cmd: '080440', year: 2023 }), ok, undefined)
  assertEquals(r.status, 200)
  const b = await r.json()
  assertEquals(b.rows.length, 1); assert(called.includes('preview'))
  const busy = (async () => new Response('', { status: 429 })) as unknown as typeof fetch
  assertEquals((await handle(post({ flow: 'M', cmd: '080440', year: 2023 }), busy, undefined)).status, 429)
  assertEquals((await handle(post({ flow: 'M', cmd: 'x', year: 2023 }), ok, undefined)).status, 400)
})
