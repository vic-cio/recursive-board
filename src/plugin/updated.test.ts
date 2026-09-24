import assert from 'node:assert/strict'
import test from 'node:test'

import { stampObservedChange } from './updated.ts'

const before = `---
type: work-item
id: alpha
updated: 2026-09-20
---
Body before.
`

test('a hand edit stamps the active work item', () => {
  const after = before.replace('Body before.', 'Body after.')

  assert.equal(
    stampObservedChange({ kind: 'editor', previous: before, current: after, stamp: '2026-09-24' }),
    after.replace('updated: 2026-09-20', 'updated: 2026-09-24'),
  )
})

test('a plugin vault write is not treated as a hand edit', () => {
  const after = before.replace('updated: 2026-09-20', 'updated: 2026-09-21')

  assert.equal(
    stampObservedChange({ kind: 'vault', previous: before, current: after, stamp: '2026-09-24' }),
    after,
  )
})

test('a no-op save does not stamp', () => {
  assert.equal(
    stampObservedChange({ kind: 'editor', previous: before, current: before, stamp: '2026-09-24' }),
    before,
  )
})

test('an updated date already set to today is not rewritten', () => {
  const alreadyToday = before.replace('updated: 2026-09-20', 'updated: "2026-09-24"')
  const after = alreadyToday.replace('Body before.', 'Body after.')

  assert.equal(
    stampObservedChange({ kind: 'editor', previous: alreadyToday, current: after, stamp: '2026-09-24' }),
    after,
  )
})
