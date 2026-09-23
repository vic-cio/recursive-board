import { test } from 'node:test'
import assert from 'node:assert/strict'

import { section, listItems, bodyOf } from './sections.ts'

const ITEM = `---
type: work-item
id: wi-0004
---

# Build server

## Objective

Expose app sessions securely to Obsidian clients.

## Context

Has three children.

## Acceptance Criteria

- Sessions survive a reconnect
- [ ] Tokens expire after an hour
- [x] The server starts

## Notes
`

test('bodyOf strips the frontmatter', () => {
  assert.ok(bodyOf(ITEM).startsWith('\n# Build server'))
  assert.equal(bodyOf('# No frontmatter\n'), '# No frontmatter\n')
})

test('section reads the text under a heading', () => {
  assert.equal(
    section(bodyOf(ITEM), 'Objective'),
    'Expose app sessions securely to Obsidian clients.',
  )
})

test('section stops at the next heading of the same level', () => {
  assert.equal(section(bodyOf(ITEM), 'Context'), 'Has three children.')
})

test('section matches a heading case-insensitively', () => {
  assert.equal(section(bodyOf(ITEM), 'objective'), section(bodyOf(ITEM), 'Objective'))
})

test('section returns null for a heading that is absent or empty', () => {
  assert.equal(section(bodyOf(ITEM), 'Knowledge'), null)
  assert.equal(section(bodyOf(ITEM), 'Notes'), null, 'a trailing empty section is null')
})

test('section keeps a deeper heading inside the section', () => {
  const text = '## Objective\n\nTop.\n\n### Detail\n\nMore.\n\n## Context\n\nOther.\n'
  assert.equal(section(text, 'Objective'), 'Top.\n\n### Detail\n\nMore.')
})

test('listItems strips bullets and checkboxes', () => {
  assert.deepEqual(listItems(bodyOf(ITEM), 'Acceptance Criteria'), [
    'Sessions survive a reconnect',
    'Tokens expire after an hour',
    'The server starts',
  ])
})

test('listItems returns nothing for an absent heading', () => {
  assert.deepEqual(listItems(bodyOf(ITEM), 'Nope'), [])
})

test('the template body reads as empty sections, not as content', () => {
  const template = '# T\n\n## Objective\n\n## Context\n\n## Acceptance Criteria\n\n- \n\n## Notes\n'
  assert.equal(section(template, 'Objective'), null)
  assert.deepEqual(listItems(template, 'Acceptance Criteria'), [])
})
