import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { readyCards } from './ready.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

test('readyCards selects unclaimed options in priority order and explains exclusions', async () => {
  fixture = makeVault()
  const write = (stem: string, id: string, fields: Record<string, string | number | boolean>) =>
    fixture!.write(`Boards/${stem}.md`, item({ type: 'work-item', id, title: stem,
      parent: '"[[Main]]"', status: 'options', ...fields }))
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-main', title: 'Main' }))
  write('Low', 'wi-low', { priority: 9 })
  write('High', 'wi-high', { priority: 1 })
  write('Blocked', 'wi-blocked', { blocked: true })
  write('Claimed', 'wi-claimed', { agent: 'other' })
  write('Archived', 'wi-archived', { archived: true })
  write('Dependency', 'wi-dependency', { status: 'doing' })
  write('Waiting', 'wi-waiting', { depends_on: '"[[Dependency]]"' })
  write('Area', 'wi-area', { area: true })
  write('Backlog', 'wi-backlog', { status: 'backlog' })
  write('Done', 'wi-done', { status: 'done' })
  write('Board', 'wi-board', { board: true })
  write('Orphan', 'wi-orphan', { parent: '"[[Missing]]"' })
  fixture.write('Boards/Active child.md', item({ type: 'work-item', id: 'wi-child', title: 'Active child',
    status: 'doing', parent: '"[[Board]]"', agent: 'other' }))

  const result = readyCards(await loadVault(fixture.root))
  assert.deepEqual(result.ready.map((card) => card.id), ['wi-high', 'wi-low'])
  const reasons = new Map(result.excluded.map((card) => [card.id, card.reasons]))
  assert.deepEqual(reasons.get('wi-blocked'), ['blocked'])
  assert.deepEqual(reasons.get('wi-claimed'), ['claimed'])
  assert.deepEqual(reasons.get('wi-waiting'), ['dependency'])
  assert.deepEqual(reasons.get('wi-board'), ['active-child'])
  assert.deepEqual(reasons.get('wi-orphan'), ['missing-parent'])
  assert.equal(reasons.has('wi-backlog'), false)
  assert.equal(reasons.has('wi-done'), false)
  assert.equal(reasons.has('wi-archived'), false)
  assert.equal(reasons.has('wi-area'), false)
})

test('readyCards permits a nested claim by the agent already working on its child', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-main', title: 'Main' }))
  fixture.write('Boards/Board.md', item({ type: 'work-item', id: 'wi-board', title: 'Board',
    status: 'options', parent: '"[[Main]]"', board: true }))
  fixture.write('Boards/Child.md', item({ type: 'work-item', id: 'wi-child', title: 'Child',
    status: 'doing', parent: '"[[Board]]"', agent: 'codex' }))
  const vault = await loadVault(fixture.root)
  assert.deepEqual(readyCards(vault).ready, [])
  assert.deepEqual(readyCards(vault, { agent: 'codex' }).ready.map((card) => card.id), ['wi-board'])
  assert.deepEqual(readyCards(vault, { agent: 'codex', parent: 'wi-board' }).ready, [])
  assert.deepEqual(readyCards(vault, { agent: 'codex', parent: 'wi-main' }).ready.map((card) => card.id), ['wi-board'])
})
