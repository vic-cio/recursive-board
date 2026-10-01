import { test } from 'node:test'
import assert from 'node:assert/strict'

import { freeTag, freeTagEditsIn, tagsInUse, withFreeTag } from './tags.ts'
import { applyEdits } from './edits.ts'
import { getList } from './frontmatter.ts'

test('freeTag drops a leading # and the surrounding space', () => {
  assert.equal(freeTag('design'), 'design')
  assert.equal(freeTag('  #design '), 'design')
  assert.equal(freeTag('web/ui'), 'web/ui')
  assert.equal(freeTag('café_2'), 'café_2')
})

test('freeTag refuses legacy area tags', () => {
  assert.throws(() => freeTag('area/obsidian-development'), /reserved for old area tags/)
  assert.throws(() => freeTag('#Area/x'), /reserved for old area tags/)
  assert.throws(() => freeTag('area'), /reserved for old area tags/)
})

test('freeTag refuses text that Obsidian does not read as a tag', () => {
  for (const bad of ['', '#', 'two words', '1984', 'a,b', 'a#b', '/a', 'a/', 'a//b', 'a.b']) {
    assert.throws(() => freeTag(bad), /tag/, bad)
  }
})

test('withFreeTag adds a tag at the end, once', () => {
  assert.deepEqual(withFreeTag(['area/x'], 'design', true), ['area/x', 'design'])
  assert.deepEqual(withFreeTag([], 'design', true), ['design'])
  assert.deepEqual(withFreeTag(['Design'], 'design', true), ['Design'])
  assert.deepEqual(withFreeTag(['#design'], 'design', true), ['#design'])
})

test('withFreeTag removes every spelling of a tag and keeps the old area tag', () => {
  assert.deepEqual(withFreeTag(['design', 'area/x', '#Design', 'web'], 'design', false), ['area/x', 'web'])
  assert.deepEqual(withFreeTag(['area/x'], 'design', false), ['area/x'])
})

test('withFreeTag leaves a nested tag alone when its parent is removed', () => {
  assert.deepEqual(withFreeTag(['web', 'web/ui'], 'web', false), ['web/ui'])
})

const card = (tags: string) => `---\ntype: work-item\n${tags}status: todo\n---\n\nBody\n`

test('freeTagEditsIn adds to a block list and keeps the old area tag', () => {
  const text = card('tags:\n  - area/x\n')
  const edits = freeTagEditsIn(text, 'design', true)
  assert.ok(edits)
  const out = applyEdits(text, edits)
  assert.deepEqual(getList(out, 'tags'), ['area/x', 'design'])
  assert.match(out, /status: todo\n---\n\nBody\n$/)
})

test('freeTagEditsIn adds a tags key when the card has none', () => {
  const text = card('')
  const out = applyEdits(text, freeTagEditsIn(text, '#design', true) ?? [])
  assert.deepEqual(getList(out, 'tags'), ['design'])
})

test('freeTagEditsIn reads a flow list and a one-line string', () => {
  const flow = card('tags: [design, web]\n')
  assert.deepEqual(getList(applyEdits(flow, freeTagEditsIn(flow, 'web', false) ?? []), 'tags'), ['design'])
  const line = card('tags: design web\n')
  assert.deepEqual(getList(applyEdits(line, freeTagEditsIn(line, 'ui', true) ?? []), 'tags'), ['design', 'web', 'ui'])
})

test('freeTagEditsIn removes the key with the last tag', () => {
  const text = card('tags:\n  - design\n')
  const out = applyEdits(text, freeTagEditsIn(text, 'design', false) ?? [])
  assert.equal(getList(out, 'tags'), undefined)
})

test('freeTagEditsIn returns null when nothing changes', () => {
  assert.equal(freeTagEditsIn(card('tags:\n  - design\n'), 'Design', true), null)
  assert.equal(freeTagEditsIn(card('tags:\n  - design\n'), 'web', false), null)
  assert.equal(freeTagEditsIn(card(''), 'web', false), null)
})

test('freeTagEditsIn refuses an old area tag before it reads the file', () => {
  assert.throws(() => freeTagEditsIn(card(''), 'area/x', true), /reserved for old area tags/)
  assert.throws(() => freeTagEditsIn(card('tags:\n  - area/x\n'), 'area/x', false), /reserved for old area tags/)
})

test('tagsInUse lists the free tags once each, sorted, with no area tag', () => {
  assert.deepEqual(
    tagsInUse([['web', 'area/x', 'Design'], ['#design', 'ui'], []]),
    ['Design', 'ui', 'web'],
  )
})
