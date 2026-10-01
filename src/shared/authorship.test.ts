import { test } from 'node:test'
import assert from 'node:assert/strict'

import { asName, authorLabel, displayName, linkTypeProblem, resolveRole } from './authorship.ts'

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

test('a card resolves its own role before the nearest ancestor role', () => {
  assert.deepEqual(resolveRole('Checker', ['Coder']), { role: 'Checker', inherited: false })
  assert.deepEqual(resolveRole(undefined, ['Coder', 'Checker']), { role: 'Coder', inherited: true })
  assert.deepEqual(resolveRole(undefined, [undefined, '', '[[Coder|the coder]]']), { role: 'Coder', inherited: true })
  assert.deepEqual(resolveRole(undefined, [undefined, undefined]), { role: undefined, inherited: false })
  assert.deepEqual(resolveRole('', ['Coder']), { role: 'Coder', inherited: true })
})
