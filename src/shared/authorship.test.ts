import { test } from 'node:test'
import assert from 'node:assert/strict'

import { asLink, authorLabel, displayName, linkTypeProblem } from './authorship.ts'

test('a name becomes a link, and a link stays as written', () => {
  assert.equal(asLink(' Victor '), '[[Victor]]')
  assert.equal(asLink('[[Session agent|agent]]'), '[[Session agent|agent]]')
  assert.throws(() => asLink('  '), /cannot be empty/)
})

test('the shown name is the link target or the text', () => {
  assert.equal(displayName('[[Checker]]'), 'Checker')
  assert.equal(displayName('[[People/Victor|Vic]]'), 'People/Victor')
  assert.equal(displayName('sam'), 'sam')
  assert.equal(displayName(''), undefined)
  assert.equal(displayName(3), undefined)
})

test('a note line names the role and the model', () => {
  assert.equal(authorLabel('[[Checker]]', 'gpt-6-luna'), 'Checker (gpt-6-luna)')
  assert.equal(authorLabel('Victor', undefined), 'Victor')
  assert.equal(authorLabel(undefined, 'gpt-6-luna'), undefined)
})

test('each field links to its own kinds of note', () => {
  assert.equal(linkTypeProblem('creator', 'Checker', 'role'), null)
  assert.equal(linkTypeProblem('creator', 'Victor', 'person'), null)
  assert.match(linkTypeProblem('owner', 'Checker', 'role')!, /has type: role\. Give that note type: person\./)
  assert.match(linkTypeProblem('role', 'Victor', undefined)!, /has no type\. Give that note type: role\./)
})
