import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tabArchivedCount } from './tab-archived-count.ts'

const column = (status: 'backlog' | 'options' | 'doing' | 'done', archived: number) =>
  ({ status, archived: Array.from({ length: archived }, () => ({})) }) as never

const columns = [column('backlog', 0), column('options', 1), column('doing', 0), column('done', 3)]

test('a phone tab counts only the archived cards of its own status', () => {
  assert.equal(tabArchivedCount(columns, 'done'), 3)
  assert.equal(tabArchivedCount(columns, 'options'), 1)
})

test('a tab with no archived cards counts zero, so the phone shows no button', () => {
  assert.equal(tabArchivedCount(columns, 'doing'), 0)
  assert.equal(tabArchivedCount(columns, 'backlog'), 0)
})
