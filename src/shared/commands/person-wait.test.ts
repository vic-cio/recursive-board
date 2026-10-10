import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { setDependency } from './depend.ts'
import { claimItem } from './claim-release.ts'
import { setStatus } from './status.ts'
import { validate } from './validate.ts'
import { agentsReport } from './agents.ts'
import { showCard } from './show.ts'
import { readyCards } from './ready.ts'
import { loadVault } from '../../cli/vault.ts'
import { dependenciesOf } from '../item-dependencies.ts'
import { getList } from '../frontmatter.ts'
import { makeVault, item, type Fixture } from '../../cli/test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

const card = (id: string, title: string, extra: Record<string, string | number | boolean> = {}) => item({
  type: 'work-item', id, title, status: 'options', parent: '"[[Main]]"', created: '2026-10-10', updated: '2026-10-10', ...extra,
})

/** Task is in doing with an agent, Build and Ship are options, and Ana is a person. */
function seed(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-10-10', updated: '2026-10-10' }))
  f.write('Boards/Task.md', card('wi-0002', 'Task', { status: 'doing', assignee: 'codex' }))
  f.write('Boards/Build.md', card('wi-0003', 'Build'))
  f.write('Boards/Ship.md', card('wi-0004', 'Ship', { status: 'doing' }))
  f.write('People/Ana.md', '---\ntype: person\n---\n')
  return f
}

const listOf = (f: Fixture, file: string) => getList(readFileSync(`${f.root}/Boards/${file}.md`, 'utf8'), 'depends_on')
const vaultOf = (f: Fixture) => loadVault(f.root)

test('wi depend puts a person link next to a card link, and --off clears only that link', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Task', 'Ship', true)
  const added = await setDependency(await vaultOf(fixture), 'Task', 'Ana', true)
  assert.equal(added.changed, true)
  assert.deepEqual(listOf(fixture, 'Task'), ['[[Ship]]', '[[Ana]]'])
  assert.equal((await setDependency(await vaultOf(fixture), 'Task', 'ana', true)).changed, false, 'a name matches without case')
  const cleared = await setDependency(await vaultOf(fixture), 'Task', 'Ana', false)
  assert.equal(cleared.changed, true)
  assert.deepEqual(listOf(fixture, 'Task'), ['[[Ship]]'])
  const text = readFileSync(`${fixture.root}/Boards/Task.md`, 'utf8')
  assert.match(text, /^status: doing$/m, 'clearing keeps the card in doing')
  assert.match(text, /^assignee: codex$/m)
})

test('wi depend refuses a name that is neither a card nor a person', async () => {
  fixture = seed()
  await assert.rejects(setDependency(await vaultOf(fixture), 'Task', 'Nobody', true), /no work item or person note matches "Nobody"/)
})

test('a card title wins over a person note of the same name', async () => {
  fixture = seed()
  fixture.write('People/Build.md', '---\ntype: person\n---\n')
  await setDependency(await vaultOf(fixture), 'Task', 'Build', true)
  const vault = await vaultOf(fixture)
  const waits = dependenciesOf(vault, vault.resolve('Task'))
  assert.deepEqual(waits.resolved.map((found) => found.stem), ['Build'])
  assert.deepEqual(waits.people, [])
})

test('the dependencies of a card split into cards, people and links to nothing', async () => {
  fixture = seed()
  fixture.write('Boards/Task.md', card('wi-0002', 'Task', { status: 'doing', depends_on: '["[[Ship]]", "[[Ana]]", "[[Nowhere]]"]' }))
  const vault = await vaultOf(fixture)
  const waits = dependenciesOf(vault, vault.resolve('Task'))
  assert.deepEqual(waits.resolved.map((found) => found.stem), ['Ship'])
  assert.deepEqual(waits.people, ['Ana'])
  assert.deepEqual(waits.unresolved, ['Nowhere'])
})

test('validate accepts a person link and still reports a link to nothing', async () => {
  fixture = seed()
  fixture.write('Boards/Task.md', card('wi-0002', 'Task', { status: 'doing', depends_on: '["[[Ana]]"]' }))
  assert.deepEqual((await validate(await vaultOf(fixture))).problems, [])
  fixture.write('Boards/Task.md', card('wi-0002', 'Task', { status: 'doing', depends_on: '["[[Ana]]", "[[Nowhere]]"]' }))
  assert.deepEqual((await validate(await vaultOf(fixture))).problems.map((problem) => problem.rule), ['depends-unresolved'])
})

test('claim and status doing refuse a card with a person wait', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Build', 'Ana', true)
  await assert.rejects(claimItem(await vaultOf(fixture), 'Build', 'codex'), /waits on Ana/)
  await assert.rejects(setStatus(await vaultOf(fixture), 'Build', 'doing'), /waits on Ana/)
  await setDependency(await vaultOf(fixture), 'Build', 'Ana', false)
  assert.equal((await claimItem(await vaultOf(fixture), 'Build', 'codex')).changed, true)
})

test('an assignee keeps its claim on a doing card that waits on a person', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Task', 'Ana', true)
  const again = await claimItem(await vaultOf(fixture), 'Task', 'codex')
  assert.equal(again.changed, false)
  await assert.rejects(claimItem(await vaultOf(fixture), 'Task', 'pi'), /already claimed by codex|waits on Ana/)
})

test('moving a card to done clears its person waits and keeps its card waits', async () => {
  fixture = seed()
  fixture.write('Boards/Task.md', card('wi-0002', 'Task', { status: 'doing', assignee: 'codex', depends_on: '["[[Ship]]", "[[Ana]]"]' }))
  const change = await setStatus(await vaultOf(fixture), 'Task', 'done')
  assert.equal(change.changed, true)
  assert.deepEqual(listOf(fixture, 'Task'), ['[[Ship]]'])
})

test('moving a card to done removes depends_on when only people remain', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Task', 'Ana', true)
  await setStatus(await vaultOf(fixture), 'Task', 'done')
  assert.equal(listOf(fixture, 'Task'), undefined)
  assert.match(readFileSync(`${fixture.root}/Boards/Task.md`, 'utf8'), /^status: done$/m)
})

test('a move that is not to done leaves the person wait', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Task', 'Ana', true)
  await setStatus(await vaultOf(fixture), 'Task', 'backlog')
  assert.deepEqual(listOf(fixture, 'Task'), ['[[Ana]]'])
})

test('wi agents skips an agent whose card waits on a person', async () => {
  fixture = seed()
  fixture.write('Boards/Ship.md', card('wi-0004', 'Ship', { status: 'doing', assignee: 'pi' }))
  assert.deepEqual((await agentsReport(await vaultOf(fixture), {})).agents.map((agent) => agent.name).sort(), ['codex', 'pi'])
  await setDependency(await vaultOf(fixture), 'Task', 'Ana', true)
  assert.deepEqual((await agentsReport(await vaultOf(fixture), {})).agents.map((agent) => agent.name), ['pi'])
  await setDependency(await vaultOf(fixture), 'Task', 'Ana', false)
  assert.equal((await agentsReport(await vaultOf(fixture), {})).activeAgents, 2)
})

test('a note line that says Review no longer changes the agent count', async () => {
  fixture = seed()
  fixture.write('Boards/Task.md', card('wi-0002', 'Task', { status: 'doing', assignee: 'codex' }) +
    '## Notes\n\n- 2026-10-09 09:00, codex: **Review:** Please review `a.md`.\n')
  assert.equal((await agentsReport(await vaultOf(fixture), {})).activeAgents, 1)
})

test('wi show --json lists card and person waits', async () => {
  fixture = seed()
  fixture.write('Boards/Task.md', card('wi-0002', 'Task', { status: 'doing', depends_on: '["[[Ship]]", "[[Ana]]"]' }))
  const vault = await vaultOf(fixture)
  const shown = showCard(vault, 'Task')
  assert.deepEqual(shown.dependencies.map((dependency) => dependency.title), ['Ship'])
  assert.deepEqual(shown.personDependencies, ['Ana'])
  assert.deepEqual(shown.unresolvedDependencies, [])
})

test('wi ready leaves out a card that waits on a person', async () => {
  fixture = seed()
  await setDependency(await vaultOf(fixture), 'Build', 'Ana', true)
  const ready = readyCards(await vaultOf(fixture))
  assert.deepEqual(ready.ready, [])
  assert.deepEqual(ready.excluded.map((entry) => [entry.title, entry.reasons]), [['Build', ['dependency']]])
})
