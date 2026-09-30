import { test } from 'node:test'
import assert from 'node:assert/strict'

import { menuStatuses } from './menu-status.ts'

test('menuStatuses offers status choices for an area', () => {
  assert.deepEqual(menuStatuses({ parentLink: '[[Main]]', area: true }), [
    'backlog', 'options', 'doing', 'done',
  ])
})

test('menuStatuses offers no status choices for a root', () => {
  assert.deepEqual(menuStatuses({ parentLink: null, area: false }), [])
})
