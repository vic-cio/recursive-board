import { test } from 'node:test'
import assert from 'node:assert/strict'

import { shouldRenderPromoteToggle } from './promote-visibility.ts'

test('a child with no children can still be promoted', () => {
  assert.equal(shouldRenderPromoteToggle({
    meta: { parentLink: '[[Board]]', board: false, area: false },
    childCount: 0,
  }), true)
})

test('a root without children has no promote toggle', () => {
  assert.equal(shouldRenderPromoteToggle({
    meta: { parentLink: null, board: false, area: false },
    childCount: 0,
  }), false)
})
