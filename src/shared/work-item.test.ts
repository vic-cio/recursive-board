import { test } from 'node:test'
import assert from 'node:assert/strict'

import { inheritedChildFields, renderWorkItem } from './work-item.ts'

test('a child does not inherit owner, but doing children inherit the holder', () => {
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam', holder: 'codex' }, 'doing'),
    { owner: undefined, holder: 'codex' },
  )
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam', holder: 'codex' }, 'backlog'),
    { owner: undefined, holder: undefined },
  )
})

test('a request for any agent stays on its own card', () => {
  assert.deepEqual(inheritedChildFields({ holder: 'agent' }, 'doing'), { owner: undefined, holder: undefined })
  assert.deepEqual(inheritedChildFields({}, 'options', { holder: 'agent' }), { owner: undefined, holder: 'agent' })
})

test('an explicit owner remains on the child', () => {
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam' }, 'backlog', { owner: 'lee' }),
    { owner: 'lee', holder: undefined },
  )
})

test('a new card names its holder in holder, never in agent', () => {
  const text = renderWorkItem({
    id: 'wi-a1', title: 'Price', parentStem: 'Main', status: 'doing', holder: 'codex-price',
    created: '2026-10-01', updated: '2026-10-01',
  })
  assert.match(text, /^holder: codex-price$/m)
  assert.doesNotMatch(text, /^agent:/m)
})
