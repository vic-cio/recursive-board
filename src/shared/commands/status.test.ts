import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { setStatus } from './status.ts'
import { loadVault } from '../../cli/vault.ts'
import { parseFrontmatter } from '../frontmatter.ts'
import { makeVault, item, type Fixture } from '../../cli/test-helpers.ts'

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
  }, '# Main\n'))
  f.write('Boards/Streaming.md', item({
    type: 'work-item', id: 'wi-0005', title: 'Streaming', status: 'doing',
    parent: '"[[Main]]"', mystery_key: 'keep me',
    created: '2026-09-21', updated: '2026-09-21', ...extra,
  }, '# Streaming\n\nHuman prose.\n'))
  return f
}

const fmOf = (f: Fixture) => parseFrontmatter(readFileSync(`${f.root}/Boards/Streaming.md`, 'utf8'))!

test('setStatus writes the new status', async () => {
  fixture = seed()
  const result = await setStatus(await loadVault(fixture.root), 'wi-0005', 'options')
  assert.equal(result.from, 'doing')
  assert.equal(result.to, 'options')
  assert.equal(result.changed, true)
  assert.equal(fmOf(fixture).get('status'), 'options')
})

test('setStatus stamps updated, because the Done window keys off it', async () => {
  fixture = seed()
  await setStatus(await loadVault(fixture.root), 'wi-0005', 'options')
  assert.notEqual(fmOf(fixture).get('updated'), '2026-09-21')
  assert.match(String(fmOf(fixture).get('updated')), /^\d{4}-\d{2}-\d{2}$/)
})

test('moving to done records the previous status', async () => {
  fixture = seed()
  await setStatus(await loadVault(fixture.root), 'wi-0005', 'done')
  assert.equal(fmOf(fixture).get('status'), 'done')
  assert.equal(fmOf(fixture).get('prev_status'), 'doing')
})

test('moving off done clears prev_status, so it never goes stale', async () => {
  fixture = seed({ status: 'done', prev_status: 'doing' })
  await setStatus(await loadVault(fixture.root), 'wi-0005', 'doing')
  assert.equal(fmOf(fixture).get('status'), 'doing')
  assert.equal(fmOf(fixture).has('prev_status'), false)
})

test('unticking restores exactly what the item was, via prev_status', async () => {
  fixture = seed({ status: 'options' })
  const vault = await loadVault(fixture.root)
  await setStatus(vault, 'wi-0005', 'done')
  const recorded = fmOf(fixture).get('prev_status')
  assert.equal(recorded, 'options')

  await setStatus(await loadVault(fixture.root), 'wi-0005', String(recorded))
  assert.equal(fmOf(fixture).get('status'), 'options')
  assert.equal(fmOf(fixture).has('prev_status'), false)
})

test('a move between two non-done statuses writes no prev_status', async () => {
  fixture = seed()
  await setStatus(await loadVault(fixture.root), 'wi-0005', 'backlog')
  assert.equal(fmOf(fixture).has('prev_status'), false)
})

test('done to done leaves the recorded prev_status alone', async () => {
  fixture = seed({ status: 'done', prev_status: 'options' })
  const result = await setStatus(await loadVault(fixture.root), 'wi-0005', 'done')
  assert.equal(result.changed, false)
  assert.equal(fmOf(fixture).get('prev_status'), 'options')
})

test('setStatus reports a no-op rather than rewriting the file', async () => {
  fixture = seed()
  const before = readFileSync(`${fixture.root}/Boards/Streaming.md`, 'utf8')
  const result = await setStatus(await loadVault(fixture.root), 'wi-0005', 'doing')
  assert.equal(result.changed, false)
  assert.equal(readFileSync(`${fixture.root}/Boards/Streaming.md`, 'utf8'), before)
})

test('setStatus preserves unknown keys and the body', async () => {
  fixture = seed()
  await setStatus(await loadVault(fixture.root), 'wi-0005', 'done')
  const text = readFileSync(`${fixture.root}/Boards/Streaming.md`, 'utf8')
  assert.match(text, /^mystery_key: keep me$/m)
  assert.ok(text.endsWith('# Streaming\n\nHuman prose.\n'))
})

test('setStatus refuses a fifth status value', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  await assert.rejects(setStatus(vault, 'wi-0005', 'active'), /not a status/i)
})

test('setStatus refuses to put a status on a root', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  await assert.rejects(setStatus(vault, 'wi-0001', 'doing'), /root/i)
})

test('setStatus refuses an unknown reference', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  await assert.rejects(setStatus(vault, 'wi-nope', 'doing'), /no work item/i)
})

test('setStatus touches exactly one file, which is the whole point of the model', async () => {
  fixture = seed()
  const mainBefore = readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8')
  await setStatus(await loadVault(fixture.root), 'wi-0005', 'done')
  assert.equal(readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8'), mainBefore)
})

test('done on the last open child reports the parent, and writes nothing to it', async () => {
  fixture = seed()
  const sub = (id: string, title: string, status: string, extra = {}) => fixture!.write(`Boards/${title}.md`, item({
    type: 'work-item', id, title, status, parent: '"[[Streaming]]"', created: '2026-09-21', updated: '2026-09-21', ...extra,
  }))
  sub('wi-0006', 'First', 'done')
  sub('wi-0007', 'Second', 'doing')
  sub('wi-0008', 'Shelved', 'backlog', { archived: true })
  sub('wi-0009', 'Third', 'doing')
  const parentBefore = readFileSync(join(fixture.root, 'Boards', 'Streaming.md'), 'utf8')

  const notLast = await setStatus(await loadVault(fixture.root), 'wi-0007', 'done')
  assert.equal(notLast.parentReady, undefined)
  const last = await setStatus(await loadVault(fixture.root), 'wi-0009', 'done')
  assert.equal(last.parentReady?.id, 'wi-0005')
  assert.equal(readFileSync(join(fixture.root, 'Boards', 'Streaming.md'), 'utf8'), parentBefore)
})

test('done under a root reports no parent', async () => {
  fixture = seed()
  const change = await setStatus(await loadVault(fixture.root), 'wi-0005', 'done')
  assert.equal(change.parentReady, undefined)
})
