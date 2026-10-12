/**
 * People in the plugin data (docs/adr/0085-people-live-in-the-plugin-data.md): the list under
 * `board.people`, plain-name waits, and the old `[[Person]]` waits that keep working.
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { setDependency } from './depend.ts'
import { assign } from './assign.ts'
import { claimItem } from './claim-release.ts'
import { setStatus } from './status.ts'
import { validate } from './validate.ts'
import { agentsReport } from './agents.ts'
import { showCard } from './show.ts'
import { loadVault } from '../../cli/vault.ts'
import { dependenciesOf } from '../item-dependencies.ts'
import { getList } from '../frontmatter.ts'
import { PLUGIN_DATA_FILE } from '../board-settings.ts'
import { makeVault, item, type Fixture } from '../../cli/test-helpers.ts'

let fixture: Fixture | undefined
const cleanups: (() => void)[] = []
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
  for (const cleanup of cleanups.splice(0)) cleanup()
})

const CLI = fileURLToPath(new URL('../../cli/wi.ts', import.meta.url))

/** Runs the real `wi` from a folder outside any vault. */
function wi(args: string[], vault: string): { code: number; stdout: string; stderr: string } {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'wi-people-')))
  cleanups.push(() => rmSync(cwd, { recursive: true, force: true }))
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WI_VAULT: vault },
    })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const failed = error as { status: number; stdout: string; stderr: string }
    return { code: failed.status, stdout: failed.stdout, stderr: failed.stderr }
  }
}

const card = (id: string, title: string, extra: Record<string, string | number | boolean> = {}) => item({
  type: 'work-item', id, title, status: 'options', parent: '"[[Main]]"', created: '2026-10-10', updated: '2026-10-10', ...extra,
})

/** Task is in doing with an agent, Build is in options, and the people list holds Victor and Ana Lee. No person note. */
function seed(people = '["Victor", "Ana Lee"]'): Fixture {
  const f = makeVault()
  f.writeSettings(`{"workItemFolder":"Boards","people":${people}}`)
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-10-10', updated: '2026-10-10' }))
  f.write('Boards/Task.md', card('wi-0002', 'Task', { status: 'doing', assignee: 'codex' }))
  f.write('Boards/Build.md', card('wi-0003', 'Build'))
  return f
}

const listOf = (f: Fixture, file: string) => getList(readFileSync(`${f.root}/Boards/${file}.md`, 'utf8'), 'depends_on')
const textOf = (f: Fixture, file: string) => readFileSync(`${f.root}/Boards/${file}.md`, 'utf8')
const vaultOf = (f: Fixture) => loadVault(f.root)

test('the vault reads the people list from the plugin data', async () => {
  fixture = seed()
  const vault = await vaultOf(fixture)
  assert.deepEqual(vault.peopleList, ['Victor', 'Ana Lee'])
  assert.equal(vault.personCalled('victor'), 'Victor')
  assert.equal(vault.personCalled('ANA LEE'), 'Ana Lee')
  assert.equal(vault.personCalled('Nobody'), undefined)
})

test('an invalid people list stops loading, as every board setting does', async () => {
  fixture = seed('"Victor"')
  await assert.rejects(vaultOf(fixture), /data\.json: people must be an array of names/)
  fixture.writeSettings('{"people":["[[Victor]]"]}')
  await assert.rejects(vaultOf(fixture), /people has the entry "\[\[Victor\]\]"/)
  fixture.writeSettings('{"people":["agent"]}')
  await assert.rejects(vaultOf(fixture), /reserved name/)
})

test('wi depend resolves a name against the list without case and stores the list spelling as a plain name', async () => {
  fixture = seed()
  const change = await setDependency(await vaultOf(fixture), 'Task', 'victor', true)
  assert.equal(change.person, 'Victor')
  assert.deepEqual(listOf(fixture, 'Task'), ['Victor'])
  assert.match(textOf(fixture, 'Task'), /^depends_on:\n {2}- Victor$/m, 'a plain name, with no brackets')
  assert.equal((await setDependency(await vaultOf(fixture), 'Task', 'VICTOR', true)).changed, false)
  await setDependency(await vaultOf(fixture), 'Task', 'ana lee', true)
  assert.deepEqual(listOf(fixture, 'Task'), ['Victor', 'Ana Lee'])
})

test('wi depend refuses an unknown name in one sentence and writes nothing', async () => {
  fixture = seed()
  const before = textOf(fixture, 'Task')
  await assert.rejects(setDependency(await vaultOf(fixture), 'Task', 'Vic', true),
    /^Error: no work item or person matches "Vic": for a person, add them in the plugin settings under People\.$/)
  assert.equal(textOf(fixture, 'Task'), before)
})

test('a plain-name wait blocks claim and status doing, and --off clears it in any case', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Build', 'Victor', true)
  await assert.rejects(claimItem(await vaultOf(fixture), 'Build', 'codex'), /waits on Victor/)
  await assert.rejects(setStatus(await vaultOf(fixture), 'Build', 'doing'), /waits on Victor/)
  const cleared = await setDependency(await vaultOf(fixture), 'Build', 'victor', false)
  assert.equal(cleared.changed, true)
  assert.equal(listOf(fixture, 'Build'), undefined)
  assert.equal((await claimItem(await vaultOf(fixture), 'Build', 'codex')).changed, true)
})

test('moving a card to done clears plain-name and old link waits, and keeps card links', async () => {
  fixture = seed()
  fixture.write('People/Sam.md', '---\ntype: person\n---\n')
  fixture.write('Boards/Ship.md', card('wi-0004', 'Ship'))
  fixture.write('Boards/Task.md', card('wi-0002', 'Task', {
    status: 'doing', assignee: 'codex', depends_on: '["[[Ship]]", "Victor", "[[Sam]]"]',
  }))
  await setStatus(await vaultOf(fixture), 'Task', 'done')
  assert.deepEqual(listOf(fixture, 'Task'), ['[[Ship]]'])
})

test('an old [[Person]] wait on a person note keeps working, and --off removes it', async () => {
  fixture = seed()
  fixture.write('People/Sam.md', '---\ntype: person\n---\n')
  fixture.write('Boards/Build.md', card('wi-0003', 'Build', { depends_on: '["[[Sam]]"]' }))
  const vault = await vaultOf(fixture)
  assert.deepEqual(dependenciesOf(vault, vault.resolve('Build')).people, ['Sam'])
  await assert.rejects(claimItem(vault, 'Build', 'codex'), /waits on Sam/)
  assert.equal((await setDependency(await vaultOf(fixture), 'Build', 'sam', true)).changed, false,
    'the old link already is the wait, so nothing is added')
  assert.equal((await setDependency(await vaultOf(fixture), 'Build', 'Sam', false)).changed, true)
  assert.equal(listOf(fixture, 'Build'), undefined)
})

test('an old [[Person]] link to a name in the list counts as a wait on that person', async () => {
  fixture = seed()
  fixture.write('Boards/Build.md', card('wi-0003', 'Build', { depends_on: '["[[Victor]]"]' }))
  const vault = await vaultOf(fixture)
  const waits = dependenciesOf(vault, vault.resolve('Build'))
  assert.deepEqual(waits.people, ['Victor'])
  assert.deepEqual(waits.unresolved, [])
  assert.deepEqual((await validate(vault)).problems, [])
  await setDependency(vault, 'Build', 'Victor', false)
  assert.equal(listOf(fixture, 'Build'), undefined)
})

test('a person note still counts as a person, and wi depend writes a plain name for it', async () => {
  fixture = seed()
  fixture.write('Team/Sam.md', '---\ntype: person\n---\n')
  await setDependency(await vaultOf(fixture), 'Build', 'sam', true)
  assert.deepEqual(listOf(fixture, 'Build'), ['Sam'])
  const vault = await vaultOf(fixture)
  assert.deepEqual(dependenciesOf(vault, vault.resolve('Build')).people, ['Sam'])
  assert.deepEqual((await validate(vault)).problems, [])
})

test('the list spelling wins over a person note of another case', async () => {
  fixture = seed()
  fixture.write('People/victor.md', '---\ntype: person\n---\n')
  await setDependency(await vaultOf(fixture), 'Build', 'VICTOR', true)
  assert.deepEqual(listOf(fixture, 'Build'), ['Victor'])
})

test('a wait on a name no one has still blocks, and validate warns', async () => {
  fixture = seed()
  fixture.write('Boards/Build.md', card('wi-0003', 'Build', { depends_on: '["Zed"]' }))
  const vault = await vaultOf(fixture)
  const waits = dependenciesOf(vault, vault.resolve('Build'))
  assert.deepEqual(waits.people, ['Zed'])
  assert.deepEqual(waits.unknownPeople, ['Zed'])
  await assert.rejects(claimItem(vault, 'Build', 'codex'), /waits on Zed/)
  const problems = (await validate(vault)).problems
  assert.deepEqual(problems.map((problem) => `${problem.rule} ${problem.severity}`), ['depends-unknown-person warning'])
  assert.match(problems[0]!.message, /Add the person in the plugin settings under People/)
  assert.equal((await setDependency(vault, 'Build', 'Zed', false)).changed, true)
  assert.equal(listOf(fixture, 'Build'), undefined)
})

test('wi show and wi children --json keep the same fields for a plain-name wait', async () => {
  fixture = seed()
  fixture.write('Boards/Ship.md', card('wi-0004', 'Ship'))
  fixture.write('Boards/Task.md', card('wi-0002', 'Task', { status: 'doing', depends_on: '["[[Ship]]", "victor"]' }))
  const shown = showCard(await vaultOf(fixture), 'Task')
  assert.deepEqual(shown.dependencies.map((dependency) => dependency.title), ['Ship'])
  assert.deepEqual(shown.personDependencies, ['Victor'])
  assert.deepEqual(shown.unresolvedDependencies, [])
  assert.deepEqual(shown.malformedDependencies, [])
  const children = wi(['children', 'Main', '--json'], fixture.root)
  assert.equal(children.code, 0, children.stderr)
  assert.match(JSON.stringify(JSON.parse(children.stdout)), /"waits_on_people":\["Victor"\]/)
  const refused = wi(['assign', 'Build', '--to', 'Vic'], fixture.root)
  assert.equal(refused.code, 2)
  assert.equal(refused.stderr, 'wi: Vic is not a person in this vault: add the person in the plugin settings under People, or use --to agent for any agent.\n')
})

test('wi assign resolves a name against the list without case and stores the list spelling', async () => {
  fixture = seed()
  const result = await assign(await vaultOf(fixture), 'Build', { to: 'ana lee' })
  assert.equal(result.name, 'Ana Lee')
  assert.match(textOf(fixture, 'Build'), /^assignee: Ana Lee$/m)
})

test('wi assign refuses an unknown name in one sentence, and --to agent still works', async () => {
  fixture = seed()
  const before = textOf(fixture, 'Build')
  await assert.rejects(assign(await vaultOf(fixture), 'Build', { to: 'Vic' }),
    /^Error: Vic is not a person in this vault: add the person in the plugin settings under People, or use --to agent for any agent\.$/)
  assert.equal(textOf(fixture, 'Build'), before)
  const any = await assign(await vaultOf(fixture), 'Build', { to: 'agent' })
  assert.deepEqual(any.assignees, ['agent'])
  // An agent name is still any name: an agent claims by its own name.
  assert.equal((await claimItem(await vaultOf(fixture), 'Build', 'pi-worker-7')).changed, true)
})

test('wi agents does not count a person from the list', async () => {
  fixture = seed()
  fixture.write('Boards/Build.md', card('wi-0003', 'Build', { status: 'doing', assignee: 'Victor' }))
  assert.deepEqual((await agentsReport(await vaultOf(fixture), {})).agents.map((agent) => agent.name), ['codex'])
})

test('wi reads the plugin data and never writes it', async () => {
  fixture = seed()
  const before = readFileSync(`${fixture.root}/${PLUGIN_DATA_FILE}`, 'utf8')
  await setDependency(await vaultOf(fixture), 'Build', 'Victor', true)
  await assign(await vaultOf(fixture), 'Build', { to: 'Ana Lee' })
  await setDependency(await vaultOf(fixture), 'Build', 'Victor', false)
  assert.equal(readFileSync(`${fixture.root}/${PLUGIN_DATA_FILE}`, 'utf8'), before)
})
