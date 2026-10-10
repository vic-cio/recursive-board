import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { claimItem, releaseItem } from './claim-release.ts'
import { setDependency } from './depend.ts'
import { loadVault } from '../../cli/vault.ts'
import { parseFrontmatter } from '../frontmatter.ts'
import { today } from '../schema.ts'
import { makeVault, item, type Fixture } from '../../cli/test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(extra: Record<string, string | number | boolean> = {}, body = '## Notes\n\nHuman note.\n\n## Next\n\nKeep this.\n'): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-09-21', updated: '2026-09-21' }))
  f.write('Boards/Task.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Task', status: 'options', parent: '"[[Main]]"',
    mystery_key: 'keep me', created: '2026-09-21', updated: '2026-09-21', ...extra,
  }, body))
  return f
}

const textOf = (f: Fixture) => readFileSync(`${f.root}/Boards/Task.md`, 'utf8')
const fmOf = (f: Fixture) => parseFrontmatter(textOf(f))!

test('claim sets holder and doing with one write, preserving unrelated text', async () => {
  fixture = seed()
  const rootBefore = readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8')
  const change = await claimItem(await loadVault(fixture.root), 'wi-0002', 'codex')
  assert.equal(change.changed, true)
  assert.equal(change.from, 'options')
  assert.equal(change.holder, 'codex')
  assert.equal(fmOf(fixture).get('holder'), 'codex')
  assert.equal(fmOf(fixture).has('agent'), false)
  assert.equal(fmOf(fixture).get('status'), 'doing')
  assert.equal(fmOf(fixture).get('updated'), today())
  assert.equal(fmOf(fixture).has('prev_status'), false)
  assert.match(textOf(fixture), /^mystery_key: keep me$/m)
  assert.ok(textOf(fixture).endsWith('## Notes\n\nHuman note.\n\n## Next\n\nKeep this.\n'))
  assert.equal(readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8'), rootBefore)
})

test('claim by the same agent in doing is a byte-for-byte no-op', async () => {
  fixture = seed({ status: 'doing', agent: 'codex', board: true })
  fixture.write('Boards/Child.md', item({ type: 'work-item', id: 'wi-0003', title: 'Child', status: 'doing', parent: '"[[Task]]"', created: '2026-09-21', updated: '2026-09-21' }))
  const before = textOf(fixture)
  const change = await claimItem(await loadVault(fixture.root), 'wi-0002', 'codex')
  assert.equal(change.changed, false)
  assert.equal(textOf(fixture), before)
})

test('claim by the same agent restores doing if status was moved', async () => {
  fixture = seed({ agent: 'codex', status: 'options', prev_status: 'doing' })
  await claimItem(await loadVault(fixture.root), 'wi-0002', 'codex')
  assert.equal(fmOf(fixture).get('status'), 'doing')
  assert.equal(fmOf(fixture).has('prev_status'), false)
})

test('a worker assigned a card claims it itself, and its claim moves the card to doing', async () => {
  fixture = seed({ holder: 'claude-task', status: 'backlog' })
  const change = await claimItem(await loadVault(fixture.root), 'wi-0002', 'claude-task')
  assert.equal(change.changed, true)
  assert.equal(fmOf(fixture).get('status'), 'doing')
  assert.equal(fmOf(fixture).get('holder'), 'claude-task')
})

test('any worker claims a card that asks for any agent, and its name replaces agent', async () => {
  fixture = seed({ holder: 'agent' })
  await claimItem(await loadVault(fixture.root), 'wi-0002', 'pi-task')
  assert.equal(fmOf(fixture).get('holder'), 'pi-task')
  assert.equal(fmOf(fixture).get('status'), 'doing')
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0002', 'codex'), /already held by pi-task/)
})

test('a claim refuses the reserved name agent', async () => {
  fixture = seed()
  const before = textOf(fixture)
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0002', 'agent'), /reserved/)
  assert.equal(textOf(fixture), before)
})

test('claim refuses a different agent, a done item, and a board with doing children', async () => {
  fixture = seed({ agent: 'claude' })
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0002', 'codex'), /already held by claude/i)
  assert.equal(fmOf(fixture).get('agent'), 'claude', 'an old card\'s agent still holds it')
  fixture.cleanup()

  fixture = seed({ status: 'done', prev_status: 'options' })
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0002', 'codex'), /done/i)
  assert.equal(fmOf(fixture).has('agent'), false)
  fixture.cleanup()

  fixture = seed({ board: true })
  fixture.write('Boards/Child.md', item({ type: 'work-item', id: 'wi-0003', title: 'Child', status: 'doing', parent: '"[[Task]]"', created: '2026-09-21', updated: '2026-09-21' }))
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0002', 'codex'), /child.*doing/i)
  assert.equal(fmOf(fixture).has('agent'), false)
})

test('an agent can hold a card and the subtask it works now, in either order', async () => {
  fixture = seed({ board: true })
  fixture.write('Boards/Child.md', item({ type: 'work-item', id: 'wi-0003', title: 'Child', status: 'options', parent: '"[[Task]]"', created: '2026-09-21', updated: '2026-09-21' }))
  await claimItem(await loadVault(fixture.root), 'wi-0002', 'codex')
  const child = await claimItem(await loadVault(fixture.root), 'wi-0003', 'codex')
  assert.equal(child.changed, true)
  fixture.cleanup()

  fixture = seed({ board: true })
  fixture.write('Boards/Child.md', item({ type: 'work-item', id: 'wi-0003', title: 'Child', status: 'doing', agent: 'codex', parent: '"[[Task]]"', created: '2026-09-21', updated: '2026-09-21' }))
  const parent = await claimItem(await loadVault(fixture.root), 'wi-0002', 'codex')
  assert.equal(parent.changed, true)
  assert.equal(fmOf(fixture).get('holder'), 'codex')
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0003', 'luna'), /already held by codex/)
})

test('claim refuses an open dependency, but a holder can repeat its claim', async () => {
  fixture = seed()
  fixture.write('Boards/Spec.md', item({ type: 'work-item', id: 'wi-spec', title: 'Spec',
    status: 'backlog', parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21' }))
  await setDependency(await loadVault(fixture.root), 'Task', 'Spec', true)
  const before = textOf(fixture)
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0002', 'codex'), /waits on Spec/)
  assert.equal(textOf(fixture), before)
  fixture.cleanup()

  fixture = seed({ depends_on: '"[[Spec]]"', status: 'doing', agent: 'codex' })
  const repeat = await claimItem(await loadVault(fixture.root), 'wi-0002', 'codex')
  assert.equal(repeat.changed, false)
})

test('claim refuses an area', async () => {
  fixture = seed()
  fixture.write('Boards/Operations.md', item({
    type: 'work-item', id: 'wi-0090', title: 'Operations', area: true,
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0090', 'codex'), /area/i)
})

test('release clears the holder, moves to options, and appends one dated note before the next section', async () => {
  fixture = seed({ agent: 'codex', status: 'done', prev_status: 'doing' })
  const rootBefore = readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8')
  const change = await releaseItem(await loadVault(fixture.root), 'wi-0002', 'usage spent', { where: 'card/task' })
  assert.equal(change.holder, 'codex')
  assert.equal(change.from, 'done')
  assert.equal(fmOf(fixture).has('agent'), false)
  assert.equal(fmOf(fixture).has('holder'), false)
  assert.equal(fmOf(fixture).get('status'), 'options')
  assert.equal(fmOf(fixture).has('prev_status'), false)
  assert.equal(fmOf(fixture).get('updated'), today())
  assert.match(textOf(fixture), new RegExp(`Human note\\.\\n- ${today()} \\d\\d:\\d\\d, codex: Released from codex: usage spent\\. Work: card/task\\.\\n\\n## Next`))
  assert.ok(textOf(fixture).endsWith('## Next\n\nKeep this.\n'))
  assert.equal(readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8'), rootBefore)
})

test('release creates a Notes section when absent and accepts no location', async () => {
  fixture = seed({ holder: 'codex', status: 'doing' }, '## Objective\n\nKeep this.\n')
  await releaseItem(await loadVault(fixture.root), 'wi-0002', 'stopped', { writer: 'Session agent' })
  assert.match(textOf(fixture), new RegExp(`## Objective\\n\\nKeep this\\.\\n\\n## Notes\\n\\n- ${today()} \\d\\d:\\d\\d, Session agent: Released from codex: stopped\\.\\n$`))
})

test('release refuses an unclaimed item without changing the file', async () => {
  fixture = seed()
  const before = textOf(fixture)
  await assert.rejects(releaseItem(await loadVault(fixture.root), 'wi-0002', 'stopped'), /no holder/i)
  assert.equal(textOf(fixture), before)
})

test('release refuses a root even if it has an agent field', async () => {
  fixture = seed()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', agent: 'codex', created: '2026-09-21', updated: '2026-09-21' }))
  const before = readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8')
  await assert.rejects(releaseItem(await loadVault(fixture.root), 'wi-0001', 'stopped'), /root/i)
  assert.equal(readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8'), before)
})

test('a claim adds the claimant beside a person who asked for an agent, and the card holds both', async () => {
  fixture = seed({ status: 'doing' }, '## Notes\n')
  fixture.write('Boards/Task.md', textOf(fixture).replace('status: doing', 'status: doing\nholder:\n  - Victor\n  - agent'))
  const change = await claimItem(await loadVault(fixture.root), 'wi-0002', 'w1')
  assert.deepEqual(change.holders, ['Victor', 'w1'])
  assert.match(textOf(fixture), /^holder:\n {2}- Victor\n {2}- w1$/m)
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0002', 'w2'), /already held by Victor, w1\..*wi assign/)
  const repeat = await claimItem(await loadVault(fixture.root), 'wi-0002', 'Victor')
  assert.equal(repeat.changed, false, 'a person who holds the card already holds its claim')
})

test('a board\'s doing child that lists the claimant among its holders does not block the claim', async () => {
  const child = item({ type: 'work-item', id: 'wi-0003', title: 'Child', status: 'doing', holder: '[Victor, codex]', parent: '"[[Task]]"', created: '2026-09-21', updated: '2026-09-21' })
  fixture = seed({ board: true })
  fixture.write('Boards/Child.md', child)
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0002', 'luna'), /child in doing/)
  const parent = await claimItem(await loadVault(fixture.root), 'wi-0002', 'codex')
  assert.equal(parent.changed, true)
})

test('release removes the caller from several holders, keeps the status, and notes it', async () => {
  fixture = seed({ status: 'doing', holder: '[Victor, w1]' })
  const change = await releaseItem(await loadVault(fixture.root), 'wi-0002', 'my part is done', { caller: 'w1' })
  assert.equal(change.holder, 'w1')
  assert.deepEqual(change.holders, ['Victor'])
  assert.equal(change.to, 'doing')
  assert.equal(fmOf(fixture).get('holder'), 'Victor')
  assert.equal(fmOf(fixture).get('status'), 'doing')
  assert.match(textOf(fixture), /, w1: Released from w1: my part is done\./)
})

test('release takes --holder first, then the caller, then the only holder, and refuses to guess', async () => {
  fixture = seed({ status: 'doing', holder: '[Victor, w1]' })
  await assert.rejects(releaseItem(await loadVault(fixture.root), 'wi-0002', 'x', { caller: 'Session agent' }),
    /several holders: Victor, w1\. Name the one to release with --holder <name>/)
  await assert.rejects(releaseItem(await loadVault(fixture.root), 'wi-0002', 'x', { holder: 'w2' }), /w2 does not hold/)
  const change = await releaseItem(await loadVault(fixture.root), 'wi-0002', 'stalled', { holder: 'W1', caller: 'Victor' })
  assert.equal(change.holder, 'w1')
  assert.equal(fmOf(fixture).get('holder'), 'Victor')
  fixture.cleanup()

  // A session agent releases a stalled worker's card: the only holder goes, whoever asks.
  fixture = seed({ status: 'doing', holder: 'w1' })
  const only = await releaseItem(await loadVault(fixture.root), 'wi-0002', 'stalled', { caller: 'Session agent' })
  assert.equal(only.holder, 'w1')
  assert.equal(only.to, 'options')
  assert.equal(fmOf(fixture).has('holder'), false)
})
