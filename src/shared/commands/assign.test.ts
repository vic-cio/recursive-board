import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assign } from './assign.ts'
import { loadVault } from '../../cli/vault.ts'
import { makeVault, item, type Fixture } from '../../cli/test-helpers.ts'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function seed(): Fixture {
  const f = makeVault()
  cleanups.push(() => f.cleanup())
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main' }, '# Main\n'))
  f.write('Boards/Tools.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Tools', status: 'doing', parent: '"[[Main]]"', board: true,
  }, '# Tools\n'))
  f.write('Boards/Price the job.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Price the job', status: 'options', parent: '"[[Tools]]"',
  }, '## Objective\n\nPrice the job.\n'))
  f.write('People/Ana.md', '---\ntype: person\n---\n')
  return f
}

const card = (f: Fixture) => readFileSync(join(f.root, 'Boards/Price the job.md'), 'utf8')
const strip = (t: string) => t.replace(/^(holder|updated): .*\n/gm, '')

test('assigning to a person only adds the holder the card: same status, no note', async () => {
  const f = seed()
  const before = card(f)
  const result = await assign(await loadVault(f.root), 'wi-0004', { to: 'ana' })
  assert.equal(result.name, 'Ana')
  const text = card(f)
  assert.match(text, /^status: options$/m, 'a person chooses when to start')
  assert.match(text, /^holder: Ana$/m)
  assert.equal(strip(text), strip(before), 'the holder line (and the updated stamp) is the only change')
})

test('assigning to a name with no person note writes nothing, harness names included', async () => {
  const f = seed()
  const before = card(f)
  for (const to of ['Bo', 'claude', 'codex']) {
    await assert.rejects(assign(await loadVault(f.root), 'wi-0004', { to }), new RegExp(`no person note called ${to}`))
  }
  assert.equal(card(f), before)
})

test('a person is a note with type: person in any folder, not a note in People/', async () => {
  const f = seed()
  f.write('Team/Sam.md', '---\ntype: person\n---\n')
  f.write('People/Bo.md', '---\ntype: role\n---\n')
  const vault = await loadVault(f.root)
  await assert.rejects(assign(vault, 'wi-0004', { to: 'Bo' }), /no person note called Bo/)
  const result = await assign(vault, 'wi-0004', { to: 'sam' })
  assert.equal(result.name, 'Sam')
  assert.match(card(f), /^holder: Sam$/m)
})

test('assigning to agent asks any agent: holder agent, same status, no note', async () => {
  const f = seed()
  const before = card(f)
  const result = await assign(await loadVault(f.root), 'wi-0004', { to: 'agent' })
  assert.equal(result.name, 'agent')
  assert.match(card(f), /^holder: agent$/m)
  assert.equal(strip(card(f)), strip(before))
})

test('--role writes the holder and the role tag together', async () => {
  const f = seed()
  await assign(await loadVault(f.root), 'wi-0004', { to: 'Ana', role: 'role/checker' })
  assert.match(card(f), /^holder: Ana$/m)
  assert.match(card(f), /^tags:\n {2}- role\/checker$/m)
  await assert.rejects(assign(await loadVault(f.root), 'wi-0004', { to: 'Ana', role: 'a.b' }), /not a tag/)
})

test('a second holder joins the first, and a person and an agent hold the card at once', async () => {
  const f = seed()
  await assign(await loadVault(f.root), 'wi-0004', { to: 'Ana' })
  const result = await assign(await loadVault(f.root), 'wi-0004', { to: 'agent' })
  assert.deepEqual(result.holders, ['Ana', 'agent'])
  assert.match(card(f), /^holder:\n {2}- Ana\n {2}- agent$/m)
  const again = await assign(await loadVault(f.root), 'wi-0004', { to: 'ana' })
  assert.equal(again.changed, false, 'a name already there writes nothing')
})

test('--off removes one name and leaves the status, with no person note needed', async () => {
  const f = seed()
  f.write('Boards/Price the job.md', card(f).replace('status: options', 'status: doing\nholder:\n  - Ana\n  - w1'))
  const result = await assign(await loadVault(f.root), 'wi-0004', { to: 'w1', off: true })
  assert.deepEqual(result.holders, ['Ana'])
  assert.match(card(f), /^status: doing$/m)
  assert.match(card(f), /^holder: Ana$/m)
  const missing = await assign(await loadVault(f.root), 'wi-0004', { to: 'w1', off: true })
  assert.equal(missing.changed, false)
})

test('an area and a root are refused', async () => {
  const f = seed()
  await assert.rejects(assign(await loadVault(f.root), 'Main', { to: 'Ana' }), /root/)
})

const CLI = fileURLToPath(new URL('../../cli/wi.ts', import.meta.url))

function wi(args: string[], vault: string): { code: number; stdout: string; stderr: string } {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'wi-nogit-')))
  cleanups.push(() => rmSync(cwd, { recursive: true, force: true }))
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WI_VAULT: vault, WI_AGENT: 'Session agent', WI_MODEL: 'm-0' },
    })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

test('wi assign --to a person prints the holder', () => {
  const f = seed()
  const result = wi(['assign', 'Price the job', '--to', 'Ana'], f.root)
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /wi-0004.*options {2}\(assigned to Ana\)/)
})

test('wi assign --to agent asks any agent and prints it', () => {
  const f = seed()
  const result = wi(['assign', 'Price the job', '--to', 'agent'], f.root)
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /wi-0004.*options {2}\(any agent may take it\)/)
  assert.match(card(f), /^holder: agent$/m)
})

test('wi assign refuses the retired launch flags and --reason with exit 2', () => {
  const f = seed()
  for (const flag of ['--model', '--permission', '--agent', '--reason']) {
    const result = wi(['assign', 'Price the job', '--to', 'Ana', flag, 'x'], f.root)
    assert.equal(result.code, 2, flag)
    assert.match(result.stderr, new RegExp(flag))
  }
})

test('wi assign refuses an unknown --to with exit 2 and writes nothing', () => {
  const f = seed()
  const before = card(f)
  const result = wi(['assign', 'wi-0004', '--to', 'claude'], f.root)
  assert.equal(result.code, 2)
  assert.match(result.stderr, /no person note called claude/)
  assert.equal(card(f), before)
})

test('wi assign --json gives the holders as a list, and --off removes one', () => {
  const f = seed()
  const added = wi(['assign', 'wi-0004', '--to', 'Ana', '--json'], f.root)
  assert.equal(added.code, 0, added.stderr)
  assert.deepEqual(JSON.parse(added.stdout), {
    id: 'wi-0004', path: 'Boards/Price the job.md', name: 'Ana', holder: ['Ana'], added: true, changed: true,
  })
  const both = wi(['assign', 'wi-0004', '--to', 'agent'], f.root)
  assert.match(both.stdout, /\(any agent may take it; holders: Ana, Agent\)/)
  const off = wi(['assign', 'wi-0004', '--to', 'Ana', '--off'], f.root)
  assert.equal(off.code, 0, off.stderr)
  assert.match(off.stdout, /\(unassigned Ana; holders: Agent\)/)
  assert.match(card(f), /^holder: agent$/m)
})

test('wi delegate is retired: it exits 0, writes nothing and names wi assign', () => {
  const f = seed()
  const before = card(f)
  const result = wi(['delegate', 'wi-0004', '--to', 'Ana'], f.root)
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /wi delegate is retired\. .*wi assign <ref> --to <person\|agent>/)
  assert.equal(card(f), before)
})
