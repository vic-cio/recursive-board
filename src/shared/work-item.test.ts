import { test } from 'node:test'
import assert from 'node:assert/strict'

import { inheritedChildFields } from './work-item.ts'

test('a child does not inherit owner, but doing children inherit agent', () => {
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam', agent: 'codex' }, 'doing'),
    { owner: undefined, agent: 'codex' },
  )
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam', agent: 'codex' }, 'backlog'),
    { owner: undefined, agent: undefined },
  )
})

test('an explicit owner remains on the child', () => {
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam' }, 'backlog', { owner: 'lee' }),
    { owner: 'lee', agent: undefined },
  )
})
