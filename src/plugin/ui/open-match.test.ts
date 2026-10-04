import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findById, matchWorkItems } from './open-match.ts'

type Item = { id: string | undefined; title: string; status: 'backlog' | 'options' | 'doing' | 'done' | undefined; effectiveArchived: boolean }

const item = (id: string | undefined, title: string, extra: Partial<Item> = {}): Item =>
  ({ id, title, status: 'options', effectiveArchived: false, ...extra })

const target = item('wi-k7m3', 'Add an open-by-id command to the plugin')
const items = [
  item('wi-a1b2', 'Price the demolition lines'),
  item('wi-k7mx', 'Tidy the dashboard head'),
  target,
  item('wi-zz99', 'Write the release notes for k7m3'),
  item(undefined, 'Main'),
]

const titles = (found: readonly Item[]) => found.map((found) => found.title)

test('an exact id ranks the card first', () => {
  assert.equal(matchWorkItems(items, 'wi-k7m3')[0], target)
})

test('a bare suffix ranks the card first, before a title that mentions it', () => {
  const found = matchWorkItems(items, 'k7m3')
  assert.equal(found[0], target)
  assert.deepEqual(titles(found), [target.title, 'Write the release notes for k7m3'])
})

test('an id prefix, with or without wi-, ranks the card first', () => {
  for (const query of ['wi-k7', 'k7m', 'k7m3'.slice(0, 2)]) {
    assert.equal(matchWorkItems([items[0]!, items[3]!, target], query)[0], target, query)
  }
  assert.deepEqual(titles(matchWorkItems(items, 'wi-k7')), [target.title, 'Tidy the dashboard head'])
})

test('part of a title ranks the card first', () => {
  assert.equal(matchWorkItems(items, 'open-by-id')[0], target)
  assert.equal(matchWorkItems(items, 'OPEN-BY')[0], target)
})

test('every word of the query found in the title is a match', () => {
  assert.deepEqual(titles(matchWorkItems(items, 'plugin open')), [target.title])
})

test('a title prefix ranks before a match inside a title', () => {
  const found = matchWorkItems([item('wi-0001', 'Write the notes'), item('wi-0002', 'Notes on the plugin')], 'notes')
  assert.deepEqual(titles(found), ['Notes on the plugin', 'Write the notes'])
})

test('an id match ranks before a title match', () => {
  const found = matchWorkItems([item('wi-c0de', 'Code the matcher'), item('wi-cod3', 'Write tests')], 'cod')
  assert.deepEqual(titles(found), ['Write tests', 'Code the matcher'])
})

test('open cards rank before done and archived cards at the same match strength', () => {
  const found = matchWorkItems([
    item('wi-0001', 'A done card', { status: 'done' }),
    item('wi-0002', 'B archived card', { effectiveArchived: true }),
    item('wi-0003', 'C open card'),
    item('wi-0004', 'D root', { status: undefined }),
  ], 'card')
  assert.deepEqual(titles(found), ['C open card', 'A done card', 'B archived card'])
})

test('a stronger match on a done card still ranks before a weaker match on an open card', () => {
  const found = matchWorkItems([item('wi-0001', 'Notes for k7m3'), item('wi-k7m3', 'Done work', { status: 'done' })], 'k7m3')
  assert.deepEqual(titles(found), ['Done work', 'Notes for k7m3'])
})

test('an empty query lists the open cards by title', () => {
  const found = matchWorkItems([
    item('wi-0001', 'Zebra'),
    item('wi-0002', 'Done', { status: 'done' }),
    item('wi-0003', 'Archived', { effectiveArchived: true }),
    item(undefined, 'Apple'),
  ], '   ')
  assert.deepEqual(titles(found), ['Apple', 'Zebra'])
})

test('a query that matches nothing returns nothing', () => {
  assert.deepEqual(matchWorkItems(items, 'qqqq'), [])
})

test('wi- alone is not an id prefix of every card', () => {
  assert.deepEqual(matchWorkItems(items, 'wi-'), [])
})

test('findById returns the card for an id or a bare suffix, in any case', () => {
  assert.deepEqual(findById(items, 'wi-k7m3'), { item: target, duplicates: [] })
  assert.deepEqual(findById(items, ' K7M3 '), { item: target, duplicates: [] })
})

test('findById returns null for an unknown, partial or empty id', () => {
  assert.equal(findById(items, 'wi-nope'), null)
  assert.equal(findById(items, 'k7m'), null)
  assert.equal(findById(items, ''), null)
  assert.equal(findById(items, 'wi-'), null)
})

test('findById names the other cards that hold a duplicate id', () => {
  const copy = item('wi-k7m3', 'A copied card', { status: 'done' })
  assert.deepEqual(findById([...items, copy], 'wi-k7m3'), { item: target, duplicates: [copy] })
})
