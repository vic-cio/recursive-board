import { test } from 'node:test'
import assert from 'node:assert/strict'

import { inheritedChildFields, renderWorkItem } from './work-item.ts'

test('a child does not inherit owner, but doing children inherit the holders', () => {
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam', holders: ['codex'] }, 'doing'),
    { owner: undefined, holders: ['codex'] },
  )
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam', holders: ['Victor', 'codex'] }, 'doing'),
    { owner: undefined, holders: ['Victor', 'codex'] },
  )
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam', holders: ['codex'] }, 'backlog'),
    { owner: undefined, holders: undefined },
  )
})

test('a request for any agent stays on its own card', () => {
  assert.deepEqual(inheritedChildFields({ holders: ['agent'] }, 'doing'), { owner: undefined, holders: undefined })
  assert.deepEqual(inheritedChildFields({ holders: ['Victor', 'agent'] }, 'doing'), { owner: undefined, holders: ['Victor'] })
  assert.deepEqual(inheritedChildFields({}, 'options', { holders: ['agent'] }), { owner: undefined, holders: ['agent'] })
})

test('an explicit owner remains on the child', () => {
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam' }, 'backlog', { owner: 'lee' }),
    { owner: 'lee', holders: undefined },
  )
})

test('a new card names its holder in holder, never in agent', () => {
  const text = renderWorkItem({
    id: 'wi-a1', title: 'Price', parentStem: 'Main', status: 'doing', holders: ['codex-price'],
    created: '2026-10-01', updated: '2026-10-01',
  })
  assert.match(text, /^holder: codex-price$/m)
  assert.doesNotMatch(text, /^agent:/m)
})

test('a new card with several holders writes them as a block list', () => {
  const text = renderWorkItem({
    id: 'wi-a1', title: 'Price', parentStem: 'Main', status: 'doing', holders: ['Victor', 'codex-price'],
    created: '2026-10-01', updated: '2026-10-01',
  })
  assert.match(text, /^holder:\n {2}- Victor\n {2}- codex-price\ncreated: 2026-10-01$/m)
})
