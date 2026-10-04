import { test } from 'node:test'
import assert from 'node:assert/strict'

import { openLinkTarget } from './open-link.ts'

type Item = { id: string | undefined; title: string; status: 'backlog' | 'options' | 'doing' | 'done' | undefined; effectiveArchived: boolean }

const item = (id: string | undefined, title: string): Item => ({ id, title, status: 'options', effectiveArchived: false })

const target = item('wi-td4p', 'Add an open-by-id command to the plugin')
const items = [item('wi-a1b2', 'Price the demolition lines'), target, item(undefined, 'Main')]

test('a full id opens the card with no notice', () => {
  assert.deepEqual(openLinkTarget(items, 'wi-td4p'), { item: target, notice: null })
})

test('a bare suffix, in any case and with spaces, opens the card', () => {
  assert.deepEqual(openLinkTarget(items, ' TD4P '), { item: target, notice: null })
})

test('a missing or empty id opens nothing and says the link names no id', () => {
  for (const id of [undefined, '', '  ', 'wi-']) {
    const found = openLinkTarget(items, id)
    assert.equal(found.item, null, String(id))
    assert.match(found.notice ?? '', /names no card id/, String(id))
  }
})

test('an unknown id opens nothing and the notice names the id', () => {
  assert.deepEqual(openLinkTarget(items, 'wi-zz99'), { item: null, notice: 'No card has the id wi-zz99.' })
})

test('a duplicate id opens the first card and the notice names the clash', () => {
  const copy = item('wi-td4p', 'Copied card')
  const found = openLinkTarget([...items, copy], 'td4p')
  assert.equal(found.item, target)
  assert.equal(found.notice,
    '2 cards have the id wi-td4p: Add an open-by-id command to the plugin, Copied card. Opened the first. Run wi validate to find them.')
})
