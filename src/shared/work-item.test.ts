import { test } from 'node:test'
import assert from 'node:assert/strict'

import { inheritedChildFields, renderWorkItem } from './work-item.ts'

test('a child does not inherit owner, but doing children inherit the assignees', () => {
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam', assignees: ['codex'] }, 'doing'),
    { owner: undefined, assignees: ['codex'] },
  )
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam', assignees: ['Victor', 'codex'] }, 'doing'),
    { owner: undefined, assignees: ['Victor', 'codex'] },
  )
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam', assignees: ['codex'] }, 'backlog'),
    { owner: undefined, assignees: undefined },
  )
})

test('a request for any agent stays on its own card', () => {
  assert.deepEqual(inheritedChildFields({ assignees: ['agent'] }, 'doing'), { owner: undefined, assignees: undefined })
  assert.deepEqual(inheritedChildFields({ assignees: ['Victor', 'agent'] }, 'doing'), { owner: undefined, assignees: ['Victor'] })
  assert.deepEqual(inheritedChildFields({}, 'options', { assignees: ['agent'] }), { owner: undefined, assignees: ['agent'] })
})

test('an explicit owner remains on the child', () => {
  assert.deepEqual(
    inheritedChildFields({ owner: 'sam' }, 'backlog', { owner: 'lee' }),
    { owner: 'lee', assignees: undefined },
  )
})

test('a new card names its assignee in assignee, never in holder or agent', () => {
  const text = renderWorkItem({
    id: 'wi-a1', title: 'Price', parentStem: 'Main', status: 'doing', assignees: ['codex-price'],
    created: '2026-10-01', updated: '2026-10-01',
  })
  assert.match(text, /^assignee: codex-price$/m)
  assert.doesNotMatch(text, /^holder:/m)
  assert.doesNotMatch(text, /^agent:/m)
})

test('a new card with several assignees writes them as a block list', () => {
  const text = renderWorkItem({
    id: 'wi-a1', title: 'Price', parentStem: 'Main', status: 'doing', assignees: ['Victor', 'codex-price'],
    created: '2026-10-01', updated: '2026-10-01',
  })
  assert.match(text, /^assignee:\n {2}- Victor\n {2}- codex-price\ncreated: 2026-10-01$/m)
})
