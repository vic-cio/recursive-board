import assert from 'node:assert/strict'
import test from 'node:test'

import { currentTarget } from './move-target.ts'

test('picker resolves the selected file again after the target is renamed', () => {
  const file = { path: 'Boards/New.md' }
  const oldTarget = { file, stem: 'Old' }
  const refreshedTarget = { file, stem: 'New' }
  assert.equal(currentTarget(file, (candidate) => candidate.path === 'Boards/New.md' ? refreshedTarget : null), refreshedTarget)
  assert.notEqual(currentTarget(file, () => null), oldTarget)
})
