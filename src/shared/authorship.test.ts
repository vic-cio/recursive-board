import { test } from 'node:test'
import assert from 'node:assert/strict'

import { asName, authorLabel, displayName, linkTypeProblem, roleForNewCard } from './authorship.ts'

test('a name is written plain, and a link becomes its target', () => {
  assert.equal(asName(' Ana '), 'Ana')
  assert.equal(asName('[[Session agent|agent]]'), 'Session agent')
  assert.throws(() => asName('  '), /cannot be empty/)
})

test('the shown name is the link target or the text', () => {
  assert.equal(displayName('[[Checker]]'), 'Checker')
  assert.equal(displayName('[[People/Ana|Vic]]'), 'People/Ana')
  assert.equal(displayName('sam'), 'sam')
  assert.equal(displayName(''), undefined)
  assert.equal(displayName(3), undefined)
})

test('a note line names the role and the model', () => {
  assert.equal(authorLabel('[[Checker]]', 'gpt-6-luna'), 'Checker (gpt-6-luna)')
  assert.equal(authorLabel('Ana', undefined), 'Ana')
  assert.equal(authorLabel(undefined, 'gpt-6-luna'), undefined)
})

test('each field links to its own kinds of note', () => {
  assert.equal(linkTypeProblem('creator', 'Checker', 'role'), null)
  assert.equal(linkTypeProblem('creator', 'Ana', 'person'), null)
  assert.match(linkTypeProblem('owner', 'Checker', 'role')!, /names Checker as its owner, and that note has type: role\. Give that note type: person\./)
  assert.match(linkTypeProblem('role', 'Ana', undefined)!, /has no type\. Give that note type: role\./)
})

test('a new card takes the role of its nearest ancestor that has one', () => {
  assert.equal(roleForNewCard(undefined, ['Coder', 'Checker']), 'Coder')
  assert.equal(roleForNewCard(undefined, [undefined, '', 'Checker', 'Coder']), 'Checker')
  assert.equal(roleForNewCard(undefined, [null, '[[Coder|the coder]]']), 'Coder')
  assert.equal(roleForNewCard(undefined, [undefined, undefined]), undefined)
  assert.equal(roleForNewCard(undefined, []), undefined)
})

test('an explicit role wins, and an empty one means no role', () => {
  assert.equal(roleForNewCard('Checker', ['Coder']), 'Checker')
  assert.equal(roleForNewCard('[[Checker]]', ['Coder']), 'Checker')
  assert.equal(roleForNewCard('', ['Coder']), undefined)
  assert.equal(roleForNewCard('  ', ['Coder']), undefined)
})
