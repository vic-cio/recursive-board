import { test } from 'node:test'
import assert from 'node:assert/strict'

import { archiveEdits, archiveOwner, activeDescendant } from './archive.ts'

const parents = new Map([['project', 'root'], ['task', 'project'], ['leaf', 'task']])
const parentOf = (key: string) => parents.get(key) ?? null

test('archive writes one flag on the selected item and undo removes it', () => {
  assert.deepEqual(archiveEdits(false, true), [{ op: 'set', key: 'archived', value: true }])
  assert.deepEqual(archiveEdits(true, false), [{ op: 'remove', key: 'archived' }])
  assert.equal(archiveEdits(true, true), null)
})

test('a parent flag archives descendants at read time, including through an unflagged child', () => {
  const flagged = (key: string) => key === 'project'
  assert.equal(archiveOwner('leaf', parentOf, flagged), 'project')
  assert.equal(archiveOwner('task', parentOf, flagged), 'project')
  assert.equal(archiveOwner('root', parentOf, flagged), null)
  assert.equal(archiveOwner('leaf', parentOf, () => false), null)
})

test('the nearest flag owns archive state, so an explicitly archived child stays archived', () => {
  assert.equal(archiveOwner('leaf', parentOf, (key) => key === 'task' || key === 'project'), 'task')
})

test('archive walks the whole subtree and finds an active descendant', () => {
  const childrenOf = (key: string) => ({ root: ['project'], project: ['task'], task: ['leaf'] })[key as 'root'] ?? []
  assert.equal(activeDescendant('project', childrenOf, (key) => key === 'leaf' ? 'doing' : 'done'), 'leaf')
  assert.equal(activeDescendant('task', childrenOf, () => 'done'), null)
})

test('archive walks terminate when malformed parent or child links cycle', () => {
  const loop = (key: string) => key === 'a' ? 'b' : 'a'
  assert.equal(archiveOwner('a', loop, () => false), null)
  assert.equal(activeDescendant('a', loopKey => [loop(loopKey)], () => 'done'), null)
})
