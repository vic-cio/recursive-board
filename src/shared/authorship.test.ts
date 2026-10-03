import { test } from 'node:test'
import assert from 'node:assert/strict'

import { asName, authorLabel, displayName } from './authorship.ts'

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
