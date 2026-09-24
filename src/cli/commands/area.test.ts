import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { setArea } from './area.ts'
import { loadVault } from '../vault.ts'
import { parseFrontmatter } from '../../shared/frontmatter.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(extra: Record<string, string | number | boolean> = {}): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  const fields: Record<string, string | number | boolean> = {
    type: 'work-item', id: 'wi-0005', title: 'Streaming', status: 'options',
    parent: '"[[Main]]"', mystery_key: 'keep me', owner: 'Morgan',
    created: '2026-09-21', updated: '2026-09-21',
  }
  Object.assign(fields, extra)
  if (extra['status'] === undefined) delete fields['status']
  f.write('Boards/Streaming.md', item(fields, '# Streaming\n\nHuman prose.\n'))
  return f
}

const textOf = (f: Fixture) => readFileSync(`${f.root}/Boards/Streaming.md`, 'utf8')
const fmOf = (f: Fixture) => parseFrontmatter(textOf(f))!

test('setArea converts a card and preserves unrelated frontmatter and body', async () => {
  fixture = seed({ prev_status: 'backlog' })
  const result = await setArea(await loadVault(fixture.root), 'wi-0005', { off: false })
  assert.equal(result.changed, true)
  assert.equal(fmOf(fixture).get('area'), true)
  assert.equal(fmOf(fixture).has('status'), false)
  assert.equal(fmOf(fixture).has('prev_status'), false)
  assert.equal(fmOf(fixture).get('mystery_key'), 'keep me')
  assert.equal(fmOf(fixture).get('owner'), 'Morgan')
  assert.ok(textOf(fixture).endsWith('# Streaming\n\nHuman prose.\n'))
})

test('setArea stamps updated and writes only the item', async () => {
  fixture = seed()
  const parentBefore = readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8')
  await setArea(await loadVault(fixture.root), 'wi-0005', { off: false })
  assert.notEqual(fmOf(fixture).get('updated'), '2026-09-21')
  assert.equal(readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8'), parentBefore)
})

test('setArea refuses a card in doing', async () => {
  fixture = seed({ status: 'doing' })
  await assert.rejects(
    setArea(await loadVault(fixture.root), 'wi-0005', { off: false }),
    /doing/i,
  )
})

test('setArea refuses a card with an agent', async () => {
  fixture = seed({ agent: 'codex' })
  await assert.rejects(
    setArea(await loadVault(fixture.root), 'wi-0005', { off: false }),
    /agent/i,
  )
})

test('setArea requires a status when converting an area back to a card', async () => {
  fixture = seed({ area: true, status: undefined as never })
  await assert.rejects(
    setArea(await loadVault(fixture.root), 'wi-0005', { off: true }),
    /--status/i,
  )
})

test('setArea converts an area back to a card with the requested status', async () => {
  fixture = seed({ area: true, status: undefined as never, prev_status: 'doing' })
  const result = await setArea(await loadVault(fixture.root), 'wi-0005', { off: true, status: 'backlog' })
  assert.equal(result.changed, true)
  assert.equal(fmOf(fixture).has('area'), false)
  assert.equal(fmOf(fixture).get('status'), 'backlog')
  assert.equal(fmOf(fixture).has('prev_status'), false)
  assert.equal(fmOf(fixture).get('mystery_key'), 'keep me')
  assert.ok(textOf(fixture).endsWith('# Streaming\n\nHuman prose.\n'))
})

test('setArea validates the requested card status', async () => {
  fixture = seed({ area: true, status: undefined as never })
  await assert.rejects(
    setArea(await loadVault(fixture.root), 'wi-0005', { off: true, status: 'active' }),
    /not a status/i,
  )
})
