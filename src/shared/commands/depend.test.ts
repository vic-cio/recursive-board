import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { setDependency } from './depend.ts'
import { claimItem } from './claim-release.ts'
import { setStatus } from './status.ts'
import { validate } from './validate.ts'
import { loadVault } from '../../cli/vault.ts'
import { openDependencies } from '../item-dependencies.ts'
import { getList } from '../frontmatter.ts'
import { makeVault, item, type Fixture } from '../../cli/test-helpers.ts'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('../../cli/wi.ts', import.meta.url))

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

const card = (id: string, title: string, extra: Record<string, string | number | boolean> = {}) => item({
  type: 'work-item', id, title, status: 'options', parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21', ...extra,
})

function seed(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-09-21', updated: '2026-09-21' }))
  f.write('Boards/Spec.md', card('wi-0002', 'Spec', { status: 'doing' }))
  f.write('Boards/Build.md', card('wi-0003', 'Build'))
  f.write('Boards/Ship.md', card('wi-0004', 'Ship'))
  return f
}

const listOf = (f: Fixture, file: string) => getList(readFileSync(`${f.root}/Boards/${file}.md`, 'utf8'), 'depends_on')
const vaultOf = (f: Fixture) => loadVault(f.root)

test('wi depend adds one wikilink to the waiting card only', async () => {
  fixture = seed()
  const specBefore = readFileSync(`${fixture.root}/Boards/Spec.md`, 'utf8')
  const change = await setDependency(await vaultOf(fixture), 'wi-0003', 'Spec', true)
  assert.equal(change.changed, true)
  assert.deepEqual(listOf(fixture, 'Build'), ['[[Spec]]'])
  assert.equal(readFileSync(`${fixture.root}/Boards/Spec.md`, 'utf8'), specBefore)
  assert.equal((await setDependency(await vaultOf(fixture), 'wi-0003', 'Spec', true)).changed, false)
})

test('wi depend --off removes it, and the key goes with the last one', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Build', 'Spec', true)
  await setDependency(await vaultOf(fixture), 'Build', 'Ship', true)
  await setDependency(await vaultOf(fixture), 'Build', 'Spec', false)
  assert.deepEqual(listOf(fixture, 'Build'), ['[[Ship]]'])
  await setDependency(await vaultOf(fixture), 'Build', 'Ship', false)
  assert.equal(listOf(fixture, 'Build'), undefined)
})

test('wi depend --off removes an unresolved dependency using its link target', async () => {
  fixture = seed()
  fixture.write('Boards/Build.md', card('wi-0003', 'Build', { depends_on: '"[[Gone]]"' }))
  const change = await setDependency(await vaultOf(fixture), 'Build', 'Gone', false)
  assert.equal(change.changed, true)
  assert.equal(listOf(fixture, 'Build'), undefined)
})

test('wi depend refuses a card waiting on itself, on a root, or in a cycle', async () => {
  fixture = seed()
  await assert.rejects(setDependency(await vaultOf(fixture), 'Build', 'Build', true), /cannot wait on itself/)
  await assert.rejects(setDependency(await vaultOf(fixture), 'Build', 'Main', true), /root is never done/)
  await setDependency(await vaultOf(fixture), 'Ship', 'Build', true)
  await setDependency(await vaultOf(fixture), 'Build', 'Spec', true)
  await assert.rejects(setDependency(await vaultOf(fixture), 'Spec', 'Ship', true), /Ship already waits on Spec \(Ship → Build → Spec\)/)
})

test('claim and status doing refuse a card that waits on an open card', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Build', 'Spec', true)
  await assert.rejects(claimItem(await vaultOf(fixture), 'Build', 'codex'), /waits on Spec/)
  await assert.rejects(setStatus(await vaultOf(fixture), 'Build', 'doing'), /waits on Spec/)
  await setStatus(await vaultOf(fixture), 'Build', 'backlog')
  const done = await setStatus(await vaultOf(fixture), 'Spec', 'done')
  assert.deepEqual(done.unblocked.map((unblocked) => unblocked.stem), ['Build'])
  assert.equal((await claimItem(await vaultOf(fixture), 'Build', 'codex')).changed, true)
})

test('status done names only the cards with nothing else open', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Ship', 'Spec', true)
  await setDependency(await vaultOf(fixture), 'Ship', 'Build', true)
  assert.deepEqual((await setStatus(await vaultOf(fixture), 'Spec', 'done')).unblocked, [])
})

test('status doing refuses an open dependency, as claim does', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Build', 'Spec', true)
  await assert.rejects(setStatus(await vaultOf(fixture), 'Build', 'doing'), /waits on Spec/)
})

test('an archived card that is not done still blocks, and validate warns', async () => {
  fixture = seed()
  fixture.write('Boards/Spec.md', card('wi-0002', 'Spec', { archived: true }))
  fixture.write('Boards/Build.md', card('wi-0003', 'Build', { depends_on: '"[[Spec]]"' }))
  const vault = await vaultOf(fixture)
  assert.deepEqual(openDependencies(vault, vault.resolve('Build')).map((open) => open.stem), ['Spec'])
  const report = await validate(vault)
  assert.deepEqual(report.problems.map((problem) => `${problem.rule} ${problem.severity}`), ['depends-archived warning'])
})

test('validate reports malformed, unresolved and cyclic dependencies', async () => {
  fixture = seed()
  fixture.write('Boards/Build.md', card('wi-0003', 'Build', { depends_on: '["[[Ship]]", "[[Nowhere]]", plain]' }))
  fixture.write('Boards/Ship.md', card('wi-0004', 'Ship', { depends_on: '["[[Build]]"]' }))
  const report = await validate(await vaultOf(fixture))
  assert.deepEqual(report.problems.map((problem) => `${problem.relPath} ${problem.rule}`), [
    'Boards/Build.md depends-cycle',
    'Boards/Build.md depends-malformed',
    'Boards/Build.md depends-unresolved',
    'Boards/Ship.md depends-cycle',
  ])
})

test('a dependency on a card with a space in its title reads from one line', async () => {
  fixture = seed()
  fixture.write('Boards/Write the spec.md', card('wi-0005', 'Write the spec', { status: 'doing' }))
  fixture.write('Boards/Build.md', card('wi-0003', 'Build', { depends_on: '"[[Write the spec]]"' }))
  const vault = await vaultOf(fixture)
  assert.deepEqual(openDependencies(vault, vault.resolve('Build')).map((open) => open.stem), ['Write the spec'])
})

test('the CLI adds a dependency, marks the waiting card, and names what done unblocks', async () => {
  fixture = seed()
  const wi = (...args: string[]) => run('node', [CLI, ...args], { env: { ...process.env, WI_VAULT: fixture!.root } })
  assert.match((await wi('depend', 'Build', '--on', 'Spec')).stdout, /wi-0003  Build  waits on Spec/)
  assert.match((await wi('children', 'Main')).stdout, /Build  \[waits on 1\]/)
  const json = JSON.parse((await wi('children', 'Main', '--json')).stdout) as { children: { title: string; waits_on: string[] }[] }
  assert.deepEqual(json.children.find((row) => row.title === 'Build')?.waits_on, ['wi-0002'])
  await assert.rejects(wi('claim', 'Build', '--holder', 'codex'), /waits on Spec/)
  assert.match((await wi('status', 'Spec', 'done')).stdout, /wi-0003  Build  waits on nothing open now/)
  assert.match((await wi('depend', 'Build', '--on', 'Spec', '--off')).stdout, /no longer waits on Spec/)
})

test('the validator repair command removes an unresolved dependency', async () => {
  fixture = seed()
  fixture.write('Boards/Build.md', card('wi-0003', 'Build', { depends_on: '"[[Gone]]"' }))
  const wi = (...args: string[]) => run('node', [CLI, ...args], { env: { ...process.env, WI_VAULT: fixture!.root } })
  assert.match((await wi('depend', 'wi-0003', '--on', 'Gone', '--off')).stdout, /no longer waits on Gone/)
  assert.equal(listOf(fixture, 'Build'), undefined)
})
