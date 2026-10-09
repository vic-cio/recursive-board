import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  fixture.write('Boards/Blocker.md', item({ type: 'work-item', id: 'wi-blocker', title: 'Blocker',
    status: 'backlog', parent: '"[[Main]]"' }))
  write('Waiting', 'wi-waiting', { depends_on: '"[[Blocker]]"' })
  write('Claimed', 'wi-claimed', { agent: 'other' })
  write('Archived', 'wi-archived', { archived: true })
  write('Dependency', 'wi-dependency', { status: 'doing' })
  write('Waiting on dependency', 'wi-waiting-on-dependency', { depends_on: '"[[Dependency]]"' })
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
  assert.deepEqual(reasons.get('wi-claimed'), ['claimed'])
  assert.deepEqual(reasons.get('wi-waiting'), ['dependency'])
  assert.deepEqual(reasons.get('wi-waiting-on-dependency'), ['dependency'])
  assert.deepEqual(reasons.get('wi-board'), ['active-child'])
  assert.deepEqual(reasons.get('wi-orphan'), ['missing-parent'])
  assert.equal(reasons.has('wi-backlog'), false)
  assert.equal(reasons.has('wi-done'), false)
  assert.equal(reasons.has('wi-archived'), false)
  assert.equal(reasons.has('wi-area'), false)
})

test('readyCards lists the requests for any agent first, and excludes a card someone holds', async () => {
  fixture = makeVault()
  const write = (stem: string, id: string, fields: Record<string, string | number | boolean>) =>
    fixture!.write(`Boards/${stem}.md`, item({ type: 'work-item', id, title: stem,
      parent: '"[[Main]]"', status: 'options', ...fields }))
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-main', title: 'Main' }))
  write('High', 'wi-high', { priority: 1 })
  write('Request', 'wi-request', { priority: 5, holder: 'agent' })
  write('Old request', 'wi-old-request', { agent: 'agent' })
  write('Held', 'wi-held', { holder: 'Ana' })
  write('Asked in backlog', 'wi-backlog', { status: 'backlog', holder: 'agent' })

  const result = readyCards(await loadVault(fixture.root))
  assert.deepEqual(result.ready.map((card) => [card.id, card.holder, card.request]), [
    ['wi-request', 'agent', true], ['wi-old-request', 'agent', true], ['wi-high', null, false],
  ])
  assert.deepEqual(result.excluded.map((card) => [card.id, card.holder, card.reasons]), [['wi-held', 'Ana', ['claimed']]])
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

test('readyCards excludes invalid dependencies and waits for archived unfinished dependencies', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-main', title: 'Main' }))
  fixture.write('Boards/Finished.md', item({ type: 'work-item', id: 'wi-finished', title: 'Finished',
    status: 'done', parent: '"[[Main]]"', archived: true }))
  fixture.write('Boards/Unfinished.md', item({ type: 'work-item', id: 'wi-unfinished', title: 'Unfinished',
    status: 'backlog', parent: '"[[Main]]"', archived: true }))
  for (const [title, dependency] of [
    ['Resolved', '"[[Finished]]"'], ['Waiting', '"[[Unfinished]]"'],
    ['Unresolved', '"[[Missing]]"'], ['Malformed', 'not-a-link'],
  ] satisfies [string, string][]) {
    fixture.write(`Boards/${title}.md`, item({ type: 'work-item', id: `wi-${title.toLowerCase()}`,
      title, status: 'options', parent: '"[[Main]]"', depends_on: dependency }))
  }
  const result = readyCards(await loadVault(fixture.root))
  assert.deepEqual(result.ready.map((card) => card.id), ['wi-resolved'])
  assert.deepEqual(result.excluded.map((card) => [card.id, card.reasons]), [
    ['wi-malformed', ['invalid-dependency']], ['wi-unresolved', ['invalid-dependency']],
    ['wi-waiting', ['dependency']],
  ])
})

test('readyCards excludes descendants of an archived parent', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-main', title: 'Main' }))
  fixture.write('Boards/Archived.md', item({ type: 'work-item', id: 'wi-archived', title: 'Archived',
    status: 'options', parent: '"[[Main]]"', archived: true, board: true }))
  fixture.write('Boards/Child.md', item({ type: 'work-item', id: 'wi-child', title: 'Child',
    status: 'options', parent: '"[[Archived]]"' }))
  assert.deepEqual(readyCards(await loadVault(fixture.root)).counts, { ready: 0, excluded: 0 })
})

test('readyCards sorts equal priorities by newest update and then filename', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-main', title: 'Main' }))
  for (const [title, fields] of [
    ['Old', { priority: 2, updated: '2026-09-28' }],
    ['Zulu', { priority: 2, updated: '2026-09-30' }],
    ['Alpha', { priority: 2, updated: '2026-09-30' }],
    ['Urgent', { priority: 1, updated: '2026-09-27' }],
    ['Unranked', { updated: '2026-09-30' }],
    ['Undated', {}],
  ] satisfies [string, Record<string, string | number>][]) {
    fixture.write(`Boards/${title}.md`, item({ type: 'work-item', id: `wi-${title.toLowerCase()}`,
      title, status: 'options', parent: '"[[Main]]"', ...fields }))
  }
  assert.deepEqual(readyCards(await loadVault(fixture.root)).ready.map((card) => card.id),
    ['wi-urgent', 'wi-alpha', 'wi-zulu', 'wi-old', 'wi-unranked', 'wi-undated'])
})

test('readyCards scopes descendants and exclusion reasons without changing card files', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-main', title: 'Main' }))
  fixture.write('Boards/Scope.md', item({ type: 'work-item', id: 'wi-scope', title: 'Scope',
    status: 'options', parent: '"[[Main]]"', board: true }))
  fixture.write('Boards/Nested.md', item({ type: 'work-item', id: 'wi-nested', title: 'Nested',
    status: 'doing', parent: '"[[Scope]]"', board: true, agent: 'codex' }))
  fixture.write('Boards/Inside.md', item({ type: 'work-item', id: 'wi-inside', title: 'Inside',
    status: 'options', parent: '"[[Nested]]"' }))
  fixture.write('Boards/Waited on.md', item({ type: 'work-item', id: 'wi-waited-on', title: 'Waited on',
    status: 'backlog', parent: '"[[Main]]"' }))
  fixture.write('Boards/Waiting.md', item({ type: 'work-item', id: 'wi-waiting', title: 'Waiting',
    status: 'options', parent: '"[[Scope]]"', depends_on: '"[[Waited on]]"' }))
  fixture.write('Boards/Outside.md', item({ type: 'work-item', id: 'wi-outside', title: 'Outside',
    status: 'options', parent: '"[[Main]]"', depends_on: '"[[Waited on]]"' }))
  const vault = await loadVault(fixture.root)
  const result = readyCards(vault, { parent: 'wi-scope' })
  assert.equal(result.scope?.id, 'wi-scope')
  assert.deepEqual(result.ready.map((card) => card.id), ['wi-inside'])
  assert.deepEqual(result.excluded.map((card) => [card.id, card.reasons]), [['wi-waiting', ['dependency']]])
  assert.deepEqual(result.counts, { ready: 1, excluded: 1 })
  assert.throws(() => readyCards(vault, { parent: 'wi-missing' }), /no work item matches/)
  for (const card of vault.items) assert.equal(readFileSync(join(fixture!.root, card.relPath), 'utf8'), card.text)
})
