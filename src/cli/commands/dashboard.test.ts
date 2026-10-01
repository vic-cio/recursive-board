import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { utimesSync } from 'node:fs'

import { dashboardSummary } from './dashboard.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('../wi.ts', import.meta.url))
const NOW = Date.parse('2026-09-30T12:00:00Z')
const MINUTE = 60 * 1000

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

/**
 * Two areas under one root, with a sub-area, and one card for each dashboard rule. `age` sets
 * the file's modification time before NOW, so the agent feed sorts and folds the same each run.
 */
function seed(): Fixture {
  const vault = makeVault()
  const card = (stem: string, fields: Record<string, string | number | boolean>, body = '', age = 3 * 24 * 60) => {
    const path = vault.write(`Boards/${stem}.md`, item({ type: 'work-item', title: stem, ...fields }, body))
    const time = new Date(NOW - age * MINUTE)
    utimesSync(path, time, time)
  }
  card('Main', { id: 'wi-main' })
  card('Work', { id: 'wi-work', parent: '"[[Main]]"', status: 'doing', area: true })
  card('Site', { id: 'wi-site', parent: '"[[Work]]"', status: 'doing', area: true })
  card('Home', { id: 'wi-home', parent: '"[[Main]]"', status: 'doing', area: true })
  card('Garden', { id: 'wi-garden', parent: '"[[Main]]"', status: 'backlog', area: true })

  card('Copy', { id: 'wi-copy', parent: '"[[Site]]"', status: 'doing', owner: '"[[Ana]]"', agent: 'Writer' },
    '## Notes\n\n- 2026-09-30 11:00, Writer: **Review:** Check the copy: `Docs/Copy.md`, `http://localhost:3000`.\n', 30)
  card('Layout', { id: 'wi-layout', parent: '"[[Site]]"', status: 'doing', owner: 'ana', board: true })
  card('Grid', { id: 'wi-grid', parent: '"[[Layout]]"', status: 'doing', holder: 'Builder' }, '', 10)
  card('Taxes', { id: 'wi-taxes', parent: '"[[Home]]"', status: 'doing', agent: 'Clerk' }, '', 120)
  card('Shelf', { id: 'wi-shelf', parent: '"[[Home]]"', status: 'done', agent: 'Carpenter' }, '', 60)
  card('Paint', { id: 'wi-paint', parent: '"[[Home]]"', status: 'done', agent: 'Painter' }, '', 30 * 60)
  card('Deploy', { id: 'wi-deploy', parent: '"[[Work]]"', status: 'doing', depends_on: '"[[Approve]]"' })
  card('Approve', { id: 'wi-approve', parent: '"[[Work]]"', status: 'options' })
  card('Launch', { id: 'wi-launch', parent: '"[[Work]]"', status: 'options', depends_on: '"[[Old plan]]"' })
  card('Old plan', { id: 'wi-old', parent: '"[[Work]]"', status: 'options', archived: true })
  card('Idea', { id: 'wi-idea', parent: '"[[Work]]"', status: 'backlog' })
  card('Seeds', { id: 'wi-seeds', parent: '"[[Garden]]"', status: 'options' })
  card('Loose', { id: 'wi-loose', parent: '"[[Main]]"', status: 'done' })
  return vault
}

test('dashboardSummary lists the cards that wait for the reviewer, with the paths from the Review line', async () => {
  fixture = seed()
  const summary = await dashboardSummary(await loadVault(fixture.root), { you: 'Ana', now: NOW })
  assert.equal(summary.you, 'Ana')
  assert.deepEqual(summary.review, [{
    id: 'wi-copy', title: 'Copy', path: 'Boards/Copy.md', area: 'Work', holder: 'Writer',
    what: 'Check the copy.', paths: ['Docs/Copy.md', 'http://localhost:3000'],
  }])
})

test('dashboardSummary leaves review empty when no reviewer is given', async () => {
  fixture = seed()
  const summary = await dashboardSummary(await loadVault(fixture.root), { now: NOW })
  assert.equal(summary.you, null)
  assert.deepEqual(summary.review, [])
  assert.equal(summary.counts.review, 0)
})

test('For review lists sent cards, removes verdicts, and lists a card sent again', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-main', title: 'Main' }))
  const card = (name: string, body: string, status = 'doing') => fixture!.write(`Boards/${name}.md`, item({
    type: 'work-item', id: `wi-${name.toLowerCase()}`, title: name, status, parent: '"[[Main]]"', owner: 'Ana',
  }, `## Notes\n\n${body}\n`))
  card('Sent', '- **Review:** Check it.\n')
  card('Approved', '- **Review:** Check it.\n- Approved by Ana.\n', 'done')
  card('Returned', '- **Review:** Check it.\n- Sent back by Ana.\n')
  card('Resent', '- **Review:** First.\n- Sent back by Ana.\n- **Review:** Again.\n', 'options')
  card('Unsent', '', 'doing')
  const summary = await dashboardSummary(await loadVault(fixture.root), { you: 'Ana', now: NOW })
  assert.deepEqual(summary.review.map((row) => row.title), ['Resent', 'Sent'])
})

test('dashboardSummary counts leaf cards by top area and drops an inactive area', async () => {
  fixture = seed()
  const summary = await dashboardSummary(await loadVault(fixture.root), { you: 'Ana', now: NOW })
  assert.deepEqual(summary.progress, [
    { area: { id: 'wi-home', title: 'Home', path: 'Boards/Home.md' }, name: 'Home',
      done: 2, doing: 1, total: 3, backlog: 0, percent: 67, working: 0 },
    { area: { id: 'wi-work', title: 'Work', path: 'Boards/Work.md' }, name: 'Work',
      done: 0, doing: 3, total: 5, backlog: 1, percent: 0, working: 1 },
    { area: null, name: 'No area', done: 1, doing: 0, total: 1, backlog: 0, percent: 100, working: 0 },
  ])
})

test('dashboardSummary splits claims into working, idle and recently finished', async () => {
  fixture = seed()
  const summary = await dashboardSummary(await loadVault(fixture.root), { you: 'Ana', now: NOW })
  const ids = (rows: { id: string | null }[]) => rows.map((row) => row.id)
  assert.deepEqual(ids(summary.agents.working), ['wi-grid'])
  assert.deepEqual(ids(summary.agents.idle), ['wi-taxes'])
  assert.deepEqual(ids(summary.agents.finished), ['wi-copy', 'wi-shelf'], 'handed to the reviewer, then done; Paint is too old')
  assert.deepEqual(summary.agents.working[0], {
    holder: 'Builder', id: 'wi-grid', title: 'Grid', path: 'Boards/Grid.md', status: 'doing', area: 'Work',
    active: new Date(NOW - 10 * MINUTE).toISOString(), steps: { done: 0, total: 0 },
  })
})

test('dashboardSummary names each card that needs attention, and counts them by reason', async () => {
  fixture = seed()
  const summary = await dashboardSummary(await loadVault(fixture.root), { you: 'Ana', now: NOW })
  assert.deepEqual(summary.attention.map((row) => [row.reason, row.id, row.cards.map((card) => card.id)]), [
    ['started', 'wi-deploy', ['wi-approve']],
    ['archived', 'wi-launch', ['wi-old']],
    ['quiet', 'wi-taxes', []],
  ])
  assert.equal(summary.attention[2]!.holder, 'Clerk', 'an old card\'s agent is its holder')
  assert.deepEqual(summary.counts, {
    review: 1, working: 1, idle: 1, finished: 2,
    attention: { total: 3, started: 1, archived: 1, quiet: 1 },
  })
})

test('dashboardSummary with an area as --parent groups under the next area down', async () => {
  fixture = seed()
  const summary = await dashboardSummary(await loadVault(fixture.root), { you: 'Ana', parent: 'Work', now: NOW })
  assert.deepEqual(summary.scope, { root: null, focus: { id: 'wi-work', title: 'Work', path: 'Boards/Work.md' } })
  assert.deepEqual(summary.progress.map((row) => [row.name, row.done, row.total, row.working]), [
    ['Site', 0, 2, 1],
    ['Directly in Work', 0, 3, 0],
  ])
  assert.deepEqual(summary.review.map((row) => [row.id, row.area]), [['wi-copy', 'Site']])
  assert.deepEqual(summary.agents.idle, [], 'Taxes sits in Home')
})

test('dashboardSummary with a root as --parent keeps that root, and refuses a plain card', async () => {
  fixture = seed()
  fixture.write('Boards/Other.md', item({ type: 'work-item', id: 'wi-other', title: 'Other' }))
  const far = fixture.write('Boards/Elsewhere.md', item({
    type: 'work-item', id: 'wi-else', title: 'Elsewhere', parent: '"[[Other]]"', status: 'doing', agent: 'Far',
  }))
  utimesSync(far, new Date(NOW - MINUTE), new Date(NOW - MINUTE))
  const vault = await loadVault(fixture.root)
  const all = await dashboardSummary(vault, { now: NOW })
  assert.ok(all.agents.working.some((row) => row.id === 'wi-else'))
  const main = await dashboardSummary(vault, { parent: 'Main', now: NOW })
  assert.deepEqual(main.scope.root, { id: 'wi-main', title: 'Main', path: 'Boards/Main.md' })
  assert.equal(main.agents.working.some((row) => row.id === 'wi-else'), false)
  await assert.rejects(dashboardSummary(vault, { parent: 'Copy', now: NOW }), /root or an area/)
})

test('wi dashboard --json prints the summary for the reviewer named by --you', async () => {
  fixture = seed()
  const { stdout } = await run('node', [CLI, 'dashboard', '--json', '--you', 'Ana'], {
    env: { ...process.env, WI_VAULT: fixture.root },
  })
  const summary = JSON.parse(stdout)
  assert.ok(Array.isArray(summary.review))
  assert.ok(Array.isArray(summary.people))
  assert.deepEqual(summary.review.map((row: { id: string }) => row.id), ['wi-copy'])
})

test('wi dashboard without --json prints one line per section', async () => {
  fixture = seed()
  const { stdout, stderr } = await run('node', [CLI, 'dashboard'], { env: { ...process.env, WI_VAULT: fixture.root } })
  assert.match(stderr, /--you/)
  assert.match(stdout, /^review {2}0/m)
  assert.match(stdout, /^attention {2}\d/m)
})

test('wi dashboard --panel selects panels in JSON and text output', async () => {
  fixture = seed()
  fixture.write('People/Ana.md', '---\ntype: person\n---\n')
  fixture.write('Boards/People task.md', item({ type: 'work-item', id: 'wi-person', title: 'People task', status: 'options', parent: '"[[Main]]"', holder: 'Ana' }))
  const env = { ...process.env, WI_VAULT: fixture.root }
  const json = await run('node', [CLI, 'dashboard', '--panel', 'people', '--panel', 'agents', '--json'], { env })
  const report = JSON.parse(json.stdout)
  assert.deepEqual(Object.keys(report).sort(), ['agents', 'people'])
  assert.equal(report.people[0].person, 'Ana')
  assert.deepEqual(report.people[0].cards.map((card: { status: string }) => card.status), ['options'])
  assert.equal(report.agents.maxAgents, null)
  assert.equal(report.agents.activeAgents, 3)
  const text = await run('node', [CLI, 'dashboard', '--panel', 'people'], { env })
  assert.match(text.stdout, /^people$/m)
  assert.match(text.stdout, /options  wi-person  People task/)
  assert.doesNotMatch(text.stdout, /^review/m)
})

test('the Agents panel marks a request in backlog as not ready', async () => {
  fixture = seed()
  fixture.write('Boards/Waiting.md', item({ type: 'work-item', id: 'wi-waiting', title: 'Waiting', status: 'backlog', parent: '"[[Main]]"', holder: 'agent' }))
  const { stdout } = await run('node', [CLI, 'dashboard', '--panel', 'agents'], {
    env: { ...process.env, WI_VAULT: fixture.root },
  })
  assert.match(stdout, /not yet ready for an agent  wi-waiting  Waiting  \(backlog\)/)
  assert.doesNotMatch(stdout, /^review/m)
})
