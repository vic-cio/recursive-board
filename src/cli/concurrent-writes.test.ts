/**
 * Two `wi` processes that load the vault at the same time and then write (docs/adr/0054-edits-from-the-file-at-write-time.md).
 *
 * Each test loads two snapshots before either write, so both writers start from the same old
 * state, then runs both writes at once. The lock serialises them, and the outcome is the same in
 * either order, so the tests are deterministic.
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { claimItem, releaseItem } from './commands/claim-release.ts'
import { setDependency } from './commands/depend.ts'
import { createItem } from './commands/new.ts'
import { retag } from './commands/retag.ts'
import { setStatus } from './commands/status.ts'
import { moveItem } from './commands/move.ts'
import { setArea } from './commands/area.ts'
import { setPeople } from './commands/set.ts'
import { archiveItem } from './commands/archive.ts'
import { loadVault } from './vault.ts'
import { getList, parseFrontmatter } from '../shared/frontmatter.ts'
import { makeVault, item, type Fixture } from './test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

const dates = { created: '2026-09-21', updated: '2026-09-21' }
const card = (id: string, title: string, extra: Record<string, string | number | boolean> = {}) => item({
  type: 'work-item', id, title, status: 'options', parent: '"[[Main]]"', ...dates, ...extra,
}, '## Notes\n')

function seed(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', board: true, ...dates }))
  f.write('Boards/Task.md', card('wi-0002', 'Task'))
  f.write('Boards/Spec.md', card('wi-0003', 'Spec'))
  f.write('Boards/Design.md', card('wi-0004', 'Design'))
  return f
}

const textOf = (f: Fixture, stem: string) => readFileSync(join(f.root, 'Boards', `${stem}.md`), 'utf8')
const fmOf = (f: Fixture, stem: string) => parseFrontmatter(textOf(f, stem))!
const snapshots = (f: Fixture) => Promise.all([loadVault(f.root), loadVault(f.root)])

test('two concurrent claims of one card: one agent wins and the other is refused', async () => {
  fixture = seed()
  const [a, b] = await snapshots(fixture)
  const results = await Promise.allSettled([claimItem(a, 'Task', 'alpha'), claimItem(b, 'Task', 'beta')])
  const won = results.filter((r) => r.status === 'fulfilled')
  const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  assert.equal(won.length, 1, 'exactly one claim succeeds')
  assert.equal(lost.length, 1, 'the other claim reports failure')
  assert.match(String(lost[0]!.reason), /already claimed by (alpha|beta)/)
  const winner = (won[0] as PromiseFulfilledResult<{ agent: string }>).value.agent
  assert.equal(fmOf(fixture, 'Task').get('agent'), winner)
})

test('a claim refuses a card that another process gave an open dependency after the load', async () => {
  fixture = seed()
  fixture.write('Boards/Spec.md', item({ type: 'work-item', id: 'wi-spec', title: 'Spec',
    status: 'backlog', parent: '"[[Main]]"' }))
  const vault = await loadVault(fixture.root)
  writeFileSync(join(fixture.root, 'Boards/Task.md'), textOf(fixture, 'Task').replace('status: options', 'status: options\ndepends_on: "[[Spec]]"'))
  await assert.rejects(claimItem(vault, 'Task', 'alpha'), /waits on Spec/)
  assert.equal(fmOf(fixture, 'Task').has('agent'), false)
})

test('a release names the agent that holds the card now', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  await claimItem(await loadVault(fixture.root), 'Task', 'alpha')
  const change = await releaseItem(vault, 'Task', 'stopped')
  assert.equal(change.agent, 'alpha')
  assert.equal(change.from, 'doing')
  assert.match(textOf(fixture, 'Task'), /Released from alpha: stopped\./)
})

test('two concurrent dependency adds on one card keep both', async () => {
  fixture = seed()
  const [a, b] = await snapshots(fixture)
  await Promise.all([setDependency(a, 'Task', 'Spec', true), setDependency(b, 'Task', 'Design', true)])
  assert.deepEqual(getList(textOf(fixture, 'Task'), 'depends_on')?.sort(), ['[[Design]]', '[[Spec]]'])
})

test('a dependency removal keeps an entry added after the load', async () => {
  fixture = seed()
  await setDependency(await loadVault(fixture.root), 'Task', 'Spec', true)
  const [a, b] = await snapshots(fixture)
  await Promise.all([setDependency(a, 'Task', 'Design', true), setDependency(b, 'Task', 'Spec', false)])
  assert.deepEqual(getList(textOf(fixture, 'Task'), 'depends_on'), ['[[Design]]'])
})

test('two concurrent creates with one title keep both cards', async () => {
  fixture = seed()
  const [a, b] = await snapshots(fixture)
  const [one, two] = await Promise.all([
    createItem(a, { title: 'Streaming', parent: 'Task' }),
    createItem(b, { title: 'Streaming', parent: 'Task' }),
  ])
  assert.notEqual(one.path, two.path)
  const files = readdirSync(join(fixture.root, 'Boards')).filter((name) => name.startsWith('Streaming'))
  assert.equal(files.length, 2)
  assert.deepEqual([one.id, two.id].sort(), files.map((name) => fmOf(fixture!, name.replace(/\.md$/, '')).get('id')).sort())
  assert.equal(fmOf(fixture, 'Task').get('board'), true, 'the parent is promoted once, by either child')
})

test('wi new refuses to replace a file that appeared after the load', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  const other = card('wi-0009', 'Streaming')
  fixture.write('Boards/Streaming.md', other)
  const created = await createItem(vault, { title: 'Streaming', parent: 'Task' })
  assert.equal(textOf(fixture, 'Streaming'), other, 'the other file is untouched')
  assert.notEqual(created.relPath, 'Boards/Streaming.md')
  assert.equal(created.renamed, true)
})

test('retag keeps a tag added after the load', async () => {
  fixture = seed()
  fixture.write('.wi.json', JSON.stringify({ areaTags: true }))
  fixture.write('Boards/Task.md', card('wi-0002', 'Task', { tags: 'area/old' }))
  const vault = await loadVault(fixture.root)
  writeFileSync(join(fixture.root, 'Boards/Task.md'), textOf(fixture, 'Task').replace('tags: area/old', 'tags: area/old design'))
  await retag(vault, false)
  assert.deepEqual(getList(textOf(fixture, 'Task'), 'tags'), ['design'])
})

test('done records the status the card has now, not the loaded one', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  await setStatus(await loadVault(fixture.root), 'Task', 'backlog')
  const change = await setStatus(vault, 'Task', 'done')
  assert.equal(change.from, 'backlog')
  assert.equal(change.recorded, 'backlog')
  assert.equal(fmOf(fixture, 'Task').get('prev_status'), 'backlog')
})

test('two concurrent moves that would make a loop: one wins and the other is refused', async () => {
  fixture = seed()
  const [a, b] = await snapshots(fixture)
  const results = await Promise.allSettled([moveItem(a, 'Spec', 'Design'), moveItem(b, 'Design', 'Spec')])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const lost = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  assert.match(String(lost?.reason), /loop/)
  const parents = [fmOf(fixture, 'Spec').get('parent'), fmOf(fixture, 'Design').get('parent')]
  assert.ok(parents.includes('[[Main]]'), 'one of the two still sits under Main')
})

test('an area conversion refuses a card claimed after the load', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  await claimItem(await loadVault(fixture.root), 'Task', 'alpha')
  await assert.rejects(setArea(vault, 'Task', { off: false }), /agent "alpha"/)
  assert.equal(fmOf(fixture, 'Task').has('area'), false)
})

test('a creator set after the load is never replaced', async () => {
  fixture = seed()
  const [a, b] = await snapshots(fixture)
  const results = await Promise.allSettled([
    setPeople(a, 'Task', { creator: 'Ana' }),
    setPeople(b, 'Task', { creator: 'Bo' }),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const creator = fmOf(fixture, 'Task').get('creator')
  assert.ok(creator === 'Ana' || creator === 'Bo')
})

test('an archive reports no change when another process archived the card first', async () => {
  fixture = seed()
  const [a, b] = await snapshots(fixture)
  const [one, two] = await Promise.all([archiveItem(a, 'Task', false), archiveItem(b, 'Task', false)])
  assert.deepEqual([one.changed, two.changed].sort(), [false, true])
})
