import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { claimItem, releaseItem } from './claim-release.ts'
import { loadVault } from '../vault.ts'
import { parseFrontmatter } from '../../shared/frontmatter.ts'
import { today } from '../../shared/schema.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

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

test('claim sets agent and doing with one write, preserving unrelated text', async () => {
  fixture = seed()
  const rootBefore = readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8')
  const change = await claimItem(await loadVault(fixture.root), 'wi-0002', 'codex')
  assert.equal(change.changed, true)
  assert.equal(change.from, 'options')
  assert.equal(fmOf(fixture).get('agent'), 'codex')
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

test('claim refuses a different agent, a done item, and a board with doing children', async () => {
  fixture = seed({ agent: 'claude' })
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0002', 'codex'), /already claimed by claude/i)
  assert.equal(fmOf(fixture).get('agent'), 'claude')
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

test('claim refuses an area', async () => {
  fixture = seed()
  fixture.write('Boards/Operations.md', item({
    type: 'work-item', id: 'wi-0090', title: 'Operations', area: true,
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  await assert.rejects(claimItem(await loadVault(fixture.root), 'wi-0090', 'codex'), /area/i)
})

test('release clears agent, moves to options, and appends one dated note before the next section', async () => {
  fixture = seed({ agent: 'codex', status: 'done', prev_status: 'doing' })
  const rootBefore = readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8')
  const change = await releaseItem(await loadVault(fixture.root), 'wi-0002', 'usage spent', 'card/task')
  assert.equal(change.agent, 'codex')
  assert.equal(change.from, 'done')
  assert.equal(fmOf(fixture).has('agent'), false)
  assert.equal(fmOf(fixture).get('status'), 'options')
  assert.equal(fmOf(fixture).has('prev_status'), false)
  assert.equal(fmOf(fixture).get('updated'), today())
  assert.match(textOf(fixture), new RegExp(`Human note\\.\\n- ${today()} Released from codex: usage spent\\. Work: card/task\\.\\n\\n## Next`))
  assert.ok(textOf(fixture).endsWith('## Next\n\nKeep this.\n'))
  assert.equal(readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8'), rootBefore)
})

test('release creates a Notes section when absent and accepts no location', async () => {
  fixture = seed({ agent: 'codex', status: 'doing' }, '## Objective\n\nKeep this.\n')
  await releaseItem(await loadVault(fixture.root), 'wi-0002', 'stopped')
  assert.ok(textOf(fixture).endsWith(`## Objective\n\nKeep this.\n\n## Notes\n\n- ${today()} Released from codex: stopped.\n`))
})

test('release refuses an unclaimed item without changing the file', async () => {
  fixture = seed()
  const before = textOf(fixture)
  await assert.rejects(releaseItem(await loadVault(fixture.root), 'wi-0002', 'stopped'), /no agent/i)
  assert.equal(textOf(fixture), before)
})

test('release refuses a root even if it has an agent field', async () => {
  fixture = seed()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', agent: 'codex', created: '2026-09-21', updated: '2026-09-21' }))
  const before = readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8')
  await assert.rejects(releaseItem(await loadVault(fixture.root), 'wi-0001', 'stopped'), /root/i)
  assert.equal(readFileSync(`${fixture.root}/Boards/Main.md`, 'utf8'), before)
})
