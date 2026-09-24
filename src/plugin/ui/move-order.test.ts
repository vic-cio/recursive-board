import { test } from 'node:test'
import assert from 'node:assert/strict'

import { compareMoveTargets } from './move-order.ts'

const item = (title: string, extra: { board?: boolean; area?: boolean } = {}) =>
  ({ title, board: false, area: false, ...extra })

test('areas rank with boards, above plain cards', () => {
  const sorted = [item('Apple'), item('Zebra area', { area: true }), item('Middle board', { board: true })]
    .sort(compareMoveTargets)
  assert.deepEqual(sorted.map((t) => t.title), ['Middle board', 'Zebra area', 'Apple'])
})
