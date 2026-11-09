import { expect, it } from 'vitest'
import { cleanTerm } from './search'
it('search text cannot inject PostgREST filters', () => {
  expect(cleanTerm('acme),owner_id.eq.(x')).toBe('acme owner_id.eq. x')
  expect(cleanTerm('  50%* "gulf"  ')).toBe('50 gulf')
  expect(cleanTerm('gulffresh.ae')).toBe('gulffresh.ae')
  expect(cleanTerm('x'.repeat(100))).toHaveLength(60)
})
