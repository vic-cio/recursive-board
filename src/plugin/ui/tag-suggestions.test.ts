import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tagSuggestions } from './tag-suggestions.ts'

const inUse = ['design', 'Web', 'web/ui', 'plugin']

test('tagSuggestions puts the card tags first, checked, then the others', () => {
  assert.deepEqual(tagSuggestions(['web'], inUse, ''), [
    { kind: 'tag', tag: 'web', on: true },
    { kind: 'tag', tag: 'design', on: false },
    { kind: 'tag', tag: 'plugin', on: false },
    { kind: 'tag', tag: 'web/ui', on: false },
  ])
})

test('tagSuggestions filters by the typed text and offers it as a new tag', () => {
  assert.deepEqual(tagSuggestions([], inUse, '#we'), [
    { kind: 'new', tag: 'we' },
    { kind: 'tag', tag: 'Web', on: false },
    { kind: 'tag', tag: 'web/ui', on: false },
  ])
})

test('tagSuggestions offers no new tag when the typed text is a tag in use', () => {
  assert.deepEqual(tagSuggestions([], inUse, 'WEB'), [
    { kind: 'tag', tag: 'Web', on: false },
    { kind: 'tag', tag: 'web/ui', on: false },
  ])
  assert.deepEqual(tagSuggestions(['fresh'], inUse, 'fresh'), [{ kind: 'tag', tag: 'fresh', on: true }])
})

test('tagSuggestions refuses an area tag and text that is not a tag', () => {
  const [area] = tagSuggestions([], inUse, 'area/work')
  assert.equal(area?.kind, 'refused')
  assert.match(area?.kind === 'refused' ? area.reason : '', /wi retag/)
  const [spaced] = tagSuggestions([], inUse, 'two words')
  assert.equal(spaced?.kind, 'refused')
})
