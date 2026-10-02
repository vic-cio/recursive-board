import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyObjectiveLine } from './objective-cursor.ts'

test('the cursor goes under an empty Objective', () => {
  assert.equal(emptyObjectiveLine('---\nid: wi-a\n---\n## Objective\n\n## Context\n'), 4)
})

test('a card whose Objective has text keeps Obsidian\'s cursor', () => {
  assert.equal(emptyObjectiveLine('---\nid: wi-a\n---\n## Objective\n\nShip it.\n\n## Context\n'), null)
})

test('a card with no Objective, or no line under it, keeps Obsidian\'s cursor', () => {
  assert.equal(emptyObjectiveLine('---\nid: wi-a\n---\n## Notes\n'), null)
  assert.equal(emptyObjectiveLine('## Objective'), null)
})
