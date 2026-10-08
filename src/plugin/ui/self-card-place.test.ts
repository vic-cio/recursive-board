import { test } from 'node:test'
import assert from 'node:assert/strict'

import { selfCardColumn, selfCardKey, zoomStart } from './self-card-place.ts'

const board = (fields: Partial<{ area: boolean; status: string | undefined; parentLink: string | null; effectiveArchived: boolean }>) =>
  ({ area: true, status: 'doing', parentLink: 'Home', effectiveArchived: false, ...fields }) as never

test("an area's self-card sits in the column of the area's own status", () => {
  assert.equal(selfCardColumn(board({}), false), 'doing')
  assert.equal(selfCardColumn(board({ status: 'options' }), false), 'options')
  assert.equal(selfCardColumn(board({ status: 'backlog' }), false), 'backlog')
  assert.equal(selfCardColumn(board({ status: 'done' }), false), 'done')
})

test('a promoted card that is not an area shows no self-card', () => {
  assert.equal(selfCardColumn(board({ area: false }), false), null)
})

test('a root board shows no self-card', () => {
  assert.equal(selfCardColumn(board({ parentLink: null, status: undefined }), false), null)
  assert.equal(selfCardColumn(board({ parentLink: null }), false), null)
})

test('an archived area shows its self-card only while archived items show', () => {
  assert.equal(selfCardColumn(board({ effectiveArchived: true }), false), null)
  assert.equal(selfCardColumn(board({ effectiveArchived: true }), true), 'doing')
})

test("the self-card expands under its own key, apart from the area's card on its parent board", () => {
  const path = 'Boards/Home.md'
  assert.notEqual(selfCardKey(path), path)
  assert.equal(selfCardKey(path), selfCardKey(path))
})

test('the zoom starts with the board shrunk into the self-card', () => {
  const start = zoomStart({ left: 120, top: 300, width: 200 }, { left: 20, top: 100, width: 800 })
  assert.deepEqual(start, { x: 100, y: 200, scale: 0.25 })
})

test('a board with no width does not zoom', () => {
  assert.deepEqual(zoomStart({ left: 5, top: 5, width: 10 }, { left: 0, top: 0, width: 0 }), { x: 0, y: 0, scale: 1 })
})
