import { expect, it } from 'vitest'
import { passwordProblem } from './ChangePassword'
it('password rules', () => {
  expect(passwordProblem('short1', 'short1')).toMatch(/10/)
  expect(passwordProblem('onlyletterslong', 'onlyletterslong')).toMatch(/numbers/)
  expect(passwordProblem('goodpass123', 'goodpass124')).toMatch(/same/)
  expect(passwordProblem('goodpass123', 'goodpass123')).toBeNull()
})
