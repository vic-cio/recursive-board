import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { listChildren } from './children.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(): Fixture {
  const f = makeVault()
  const write = (
    id: string, stem: string, fields: Record<string, string | number | boolean> = {},
  ) => f.write(`Boards/${stem}.md`, item({
    type: 'work-item', id, title: stem, created: '2026-09-01', updated: '2026-09-01', ...fields,
  }, `# ${stem}\n`))

  write('wi-0001', 'Main')
  write('wi-0004', 'Build server', { status: 'doing', parent: '"[[Main]]"', board: true })
  write('wi-0005', 'Streaming', { status: 'backlog', parent: '"[[Build server]]"' })
  write('wi-0006', 'Sessions', { status: 'done', parent: '"[[Build server]]"' })
  write('wi-0007', 'Auth', { status: 'doing', parent: '"[[Streaming]]"' })
  write('wi-0008', 'Mobile UI', { status: 'options', parent: '"[[Main]]"', priority: 1 })
  return f
}

test('listChildren returns the direct children only', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  const result = listChildren(vault, 'wi-0004')
  assert.deepEqual(result.children.map((c) => c.item.id), ['wi-0006', 'wi-0005'])
})

test('listChildren counts each child own children, which is the card badge', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  const streaming = listChildren(vault, 'wi-0004').children.find((c) => c.item.id === 'wi-0005')!
  assert.equal(streaming.childCount, 1)
})

test('listChildren marks the parent as a board when board is true', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  assert.equal(listChildren(vault, 'wi-0004').parent.board, true)
  assert.equal(listChildren(vault, 'wi-0001').parent.board, false)
})

test('listChildren groups by status in column order', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  const groups = listChildren(vault, 'wi-0004').byStatus
  assert.deepEqual([...groups.keys()], ['backlog', 'options', 'doing', 'done'])
  assert.deepEqual(groups.get('backlog')!.map((c) => c.item.id), ['wi-0005'])
  assert.deepEqual(groups.get('done')!.map((c) => c.item.id), ['wi-0006'])
  assert.deepEqual(groups.get('options')!, [])
})

test('listChildren filters to one status', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  const result = listChildren(vault, 'wi-0004', { status: 'done' })
  assert.deepEqual(result.children.map((c) => c.item.id), ['wi-0006'])
})

test('listChildren returns an empty list for a leaf, and does not throw', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  assert.deepEqual(listChildren(vault, 'wi-0006').children, [])
})

test('listChildren recurses when asked, and records the depth', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  const result = listChildren(vault, 'wi-0004', { recursive: true })
  assert.deepEqual(
    result.children.map((c) => [c.item.id, c.depth]),
    [['wi-0006', 0], ['wi-0005', 0], ['wi-0007', 1]],
  )
})

test('a recursive listing survives a parent cycle rather than hanging', async () => {
  fixture = seed()
  // Make Build server a child of its own descendant.
  fixture.write('Boards/Build server.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Build server', status: 'doing',
    parent: '"[[Auth]]"', created: '2026-09-01', updated: '2026-09-01',
  }))
  const vault = await loadVault(fixture.root)
  const result = listChildren(vault, 'wi-0004', { recursive: true })
  assert.ok(result.cycle, 'the cycle is reported')
  assert.ok(result.children.length < 10, 'and the walk stops')
})

test('listChildren resolves the parent by id, filename or title', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  for (const ref of ['wi-0004', 'Build server', 'build server']) {
    assert.equal(listChildren(vault, ref).parent.id, 'wi-0004')
  }
})

test('listChildren refuses an unknown reference', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  assert.throws(() => listChildren(vault, 'wi-nope'), /no work item/i)
})

test('listChildren refuses a status that is not one of the four', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  assert.throws(() => listChildren(vault, 'wi-0004', { status: 'active' }), /not a status/i)
})
