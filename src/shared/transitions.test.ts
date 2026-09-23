import { test } from 'node:test'
import assert from 'node:assert/strict'

import { moveEdits, moveRefusal } from './transitions.ts'

// A small tree, keyed the way either writer keys it: Main > Project > Server > Auth, Main > Site.
const PARENTS: Record<string, string | null> = {
  main: null,
  project: 'main',
  server: 'project',
  auth: 'server',
  site: 'main',
}
const parentOf = (key: string) => PARENTS[key] ?? null

test('moveEdits writes the parent wikilink and nothing else', () => {
  assert.deepEqual(moveEdits('Project', 'Marketing site'), [
    { op: 'set', key: 'parent', value: '[[Marketing site]]' },
  ])
})

test('moveEdits keeps status: a move changes where, not how far along', () => {
  const edits = moveEdits('Project', 'Site') ?? []
  assert.equal(edits.some((e) => e.key === 'status' || e.key === 'prev_status'), false)
})

test('moveEdits is a no-op onto the current parent, so nothing syncs for nothing', () => {
  assert.equal(moveEdits('Project', 'Project'), null)
})

test('moveEdits compares parents the way Obsidian resolves them, ignoring case', () => {
  assert.equal(moveEdits('project', 'Project'), null)
})

test('moveRefusal allows an ordinary move', () => {
  assert.equal(moveRefusal({ item: 'auth', isRoot: false, target: 'site', parentOf }), null)
})

test('moveRefusal refuses to move a root, which has no parent to change', () => {
  assert.match(moveRefusal({ item: 'main', isRoot: true, target: 'site', parentOf }) ?? '', /root/i)
})

test('moveRefusal refuses to move an item under itself', () => {
  assert.match(moveRefusal({ item: 'server', isRoot: false, target: 'server', parentOf }) ?? '', /itself/i)
})

test('moveRefusal refuses a move under a descendant, which would cut the subtree off', () => {
  assert.match(moveRefusal({ item: 'project', isRoot: false, target: 'auth', parentOf }) ?? '', /under its own/i)
})

test('moveRefusal terminates on a vault whose parent chain already loops', () => {
  const looped = (key: string) => ({ a: 'b', b: 'a', x: 'main' } as Record<string, string>)[key] ?? null
  assert.equal(moveRefusal({ item: 'x', isRoot: false, target: 'a', parentOf: looped }), null)
})

test('moveRefusal allows moving an orphan, because that is how an orphan is repaired', () => {
  const orphaned = () => null
  assert.equal(moveRefusal({ item: 'lost', isRoot: false, target: 'main', parentOf: orphaned }), null)
})
