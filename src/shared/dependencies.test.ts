import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyEdits } from './edits.ts'
import { getList } from './frontmatter.ts'
import {
  dependencyCycle, dependencyEdit, dependencyPath, dependencyPathByKey, dependsOnValues, isOpenDependency, parseDependsOn,
} from './dependencies.ts'

test('depends_on reads wikilinks, drops repeats, and reports the rest', () => {
  assert.deepEqual(parseDependsOn(['[[A]]', '[[B|the b]]', '[[A]]', 'C', 3]), {
    targets: ['A', 'B'],
    malformed: ['C', '3'],
  })
  assert.deepEqual(parseDependsOn(undefined), { targets: [], malformed: [] })
})

test('the metadata cache value becomes a list', () => {
  assert.deepEqual(dependsOnValues(['[[A]]']), ['[[A]]'])
  assert.deepEqual(dependsOnValues('[[A]]'), ['[[A]]'])
  assert.deepEqual(dependsOnValues(undefined), [])
})

test('a dependency is open until its card is done, archived or not', () => {
  assert.equal(isOpenDependency({ status: 'doing' }), true)
  assert.equal(isOpenDependency({ status: undefined }), true)
  assert.equal(isOpenDependency({ status: 'done' }), false)
})

const card = '---\ntype: work-item\nid: wi-aaaa\ntitle: Card\nstatus: options\n---\n\nBody\n'

test('adding a dependency writes a block list of quoted wikilinks', () => {
  const edit = dependencyEdit([], 'Write the spec', true)!
  const text = applyEdits(card, [edit])
  assert.match(text, /depends_on:\n {2}- "\[\[Write the spec\]\]"\n---/)
  assert.deepEqual(getList(text, 'depends_on'), ['[[Write the spec]]'])
  assert.equal(dependencyEdit(['[[Write the spec]]'], 'Write the spec', true), null)
})

test('removing the last dependency removes the key and keeps other entries', () => {
  const two = applyEdits(card, [{ op: 'list', key: 'depends_on', values: ['[[A]]', 'odd'] }])
  const one = applyEdits(two, [dependencyEdit(['[[A]]', 'odd'], 'A', false)!])
  assert.deepEqual(getList(one, 'depends_on'), ['odd'])
  const none = applyEdits(one, [dependencyEdit(['[[A]]'], 'A', false)!])
  assert.equal(none.includes('depends_on'), false)
  assert.equal(dependencyEdit([], 'A', false), null)
})

test('a cycle is found through any number of cards', () => {
  const graph = new Map<string, string[]>([['a', ['b']], ['b', ['c']], ['c', ['a']], ['d', ['a']]])
  const depsOf = (node: string) => graph.get(node) ?? []
  assert.deepEqual(dependencyCycle('a', depsOf), ['a', 'b', 'c', 'a'])
  assert.equal(dependencyCycle('d', depsOf), null)
  assert.deepEqual(dependencyCycle('e', (n) => (n === 'e' ? ['e'] : [])), ['e', 'e'])
})

test('a path shows how one card already waits on another', () => {
  const graph = new Map<string, string[]>([['a', ['b']], ['b', ['c']]])
  const depsOf = (node: string) => graph.get(node) ?? []
  assert.deepEqual(dependencyPath('a', 'c', depsOf), ['a', 'b', 'c'])
  assert.equal(dependencyPath('c', 'a', depsOf), null)
})

test('removing matches any spelling that means the card', () => {
  const edit = dependencyEdit(['[[card]]', '[[Other]]'], 'Card', false, (target) => target.toLowerCase() === 'card')
  assert.deepEqual(edit, { op: 'list', key: 'depends_on', values: ['[[Other]]'] })
})

interface Meta { path: string; dependsOn: string[] }

test('dependencyPathByKey finds a cycle through objects rebuilt since the caller took its copy', () => {
  const index = new Map<string, Meta>()
  const rebuild = () => {
    index.set('a.md', { path: 'a.md', dependsOn: ['b.md'] })
    index.set('b.md', { path: 'b.md', dependsOn: ['c.md'] })
    index.set('c.md', { path: 'c.md', dependsOn: [] })
  }
  rebuild()
  const heldC = index.get('c.md')!
  const heldA = index.get('a.md')!
  rebuild()
  // Would C waiting on A make a loop? A waits on B, which waits on C.
  const path = dependencyPathByKey(heldA, heldC, (meta) => meta.path,
    (meta) => meta.dependsOn.flatMap((key) => index.get(key) ?? []))
  assert.deepEqual(path?.map((meta) => meta.path), ['a.md', 'b.md', 'c.md'])
})
