import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { delegate, runGit, type DelegateDeps } from './delegate.ts'
import type { LaunchSpec } from '../harness.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function seed(): Fixture {
  const f = makeVault()
  cleanups.push(() => f.cleanup())
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main' }, '# Main\n'))
  f.write('Boards/Tools.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Tools', status: 'doing', parent: '"[[Main]]"', role: 'Coder', board: true,
  }, '# Tools\n'))
  f.write('Boards/Price the job.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Price the job', status: 'options', parent: '"[[Tools]]"',
  }, '## Objective\n\nPrice the job.\n'))
  f.write('People/Ana.md', '---\ntype: person\n---\n')
  return f
}

/** A Git repository with one commit, in a folder of its own so its worktrees folder is cleaned up too. */
function repo(): string {
  const outer = realpathSync(mkdtempSync(join(tmpdir(), 'wi-delegate-')))
  cleanups.push(() => rmSync(outer, { recursive: true, force: true }))
  const root = join(outer, 'tools')
  execFileSync('git', ['init', '-q', '-b', 'main', root])
  writeFileSync(join(root, 'README.md'), 'tools\n')
  execFileSync('git', ['-C', root, 'add', '.'])
  execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init'])
  return root
}

interface Launch { spec: LaunchSpec; log: string }

function deps(cwd: string, launches: Launch[], fail?: string): DelegateDeps {
  return {
    cwd,
    git: runGit,
    launch: async (spec, log) => {
      if (fail) throw new Error(fail)
      launches.push({ spec, log })
      return { pid: 4242 }
    },
    uuid: () => '00000000-0000-4000-8000-000000000001',
    author: 'Session agent (m-0)',
  }
}

const card = (f: Fixture) => readFileSync(join(f.root, 'Boards/Price the job.md'), 'utf8')

test('delegating to a person only assigns the card: same status, no note, no Git, no process', async () => {
  const f = seed()
  const launches: Launch[] = []
  const noGit: DelegateDeps = { ...deps('/nowhere', launches), git: async () => { throw new Error('git ran') } }
  const before = card(f)
  const result = await delegate(await loadVault(f.root), 'wi-0004', { to: 'ana' }, noGit)
  assert.equal(result.holder, 'Ana')
  assert.equal(result.harness, undefined)
  assert.equal(launches.length, 0)
  const text = card(f)
  assert.match(text, /^status: options$/m, 'a person chooses when to start')
  assert.match(text, /^agent: Ana$/m)
  const strip = (t: string) => t.replace(/^(agent|updated): .*\n/gm, '')
  assert.equal(strip(text), strip(before), 'the agent line (and the updated stamp) is the only change')
})

test('delegating to a name with no person note and no harness writes nothing', async () => {
  const f = seed()
  const before = card(f)
  await assert.rejects(delegate(await loadVault(f.root), 'wi-0004', { to: 'Bo' }, deps('/nowhere', [])),
    /no person note called Bo/)
  assert.equal(card(f), before)
})

test('a person is a note with type: person in any folder, not a note in People/', async () => {
  const f = seed()
  f.write('Team/Sam.md', '---\ntype: person\n---\n')
  f.write('People/Bo.md', '---\ntype: role\n---\n')
  const vault = await loadVault(f.root)
  await assert.rejects(delegate(vault, 'wi-0004', { to: 'Bo' }, deps('/nowhere', [])), /no person note called Bo/)
  const result = await delegate(vault, 'wi-0004', { to: 'sam' }, deps('/nowhere', []))
  assert.equal(result.holder, 'Sam')
  assert.match(card(f), /^agent: Sam$/m)
})

for (const harness of ['claude', 'codex', 'pi'] as const) {
  test(`delegating to ${harness} makes the worktree, claims the card, starts the worker and notes the log`, async () => {
    const f = seed()
    const root = repo()
    const launches: Launch[] = []
    const result = await delegate(await loadVault(f.root), 'wi-0004',
      { to: harness, model: 'm-1' }, deps(join(root), launches))

    const worktree = join(root, '..', 'tools-worktrees', 'price-the-job')
    const log = join(root, '..', 'tools-worktrees', 'price-the-job.log')
    assert.equal(result.holder, `${harness}-price-the-job`)
    assert.equal(result.branch, 'card/price-the-job')
    assert.equal(result.worktree, worktree)
    assert.equal(result.log, log)
    assert.equal(result.pid, 4242)
    assert.equal(execFileSync('git', ['-C', worktree, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), 'card/price-the-job')

    assert.equal(launches.length, 1)
    const { spec } = launches[0]!
    assert.equal(spec.command, harness)
    assert.equal(spec.cwd, worktree)
    assert.equal(launches[0]!.log, log)
    assert.equal(spec.env['WI_AGENT'], `${harness}-price-the-job`)
    assert.equal(spec.env['WI_CARD'], 'wi-0004')
    assert.equal(spec.env['WI_CREATOR'], 'Coder', 'the role comes from the nearest ancestor')
    assert.equal(spec.env['WI_MODEL'], 'm-1')
    const prompt = spec.stdin ?? spec.args.at(-1)!
    assert.match(prompt, /You are .*-price-the-job, a worker on the card wi-0004/)
    assert.match(prompt, /The card body is your brief:\n\n## Objective\n\nPrice the job\.\n\n## Notes\n/)

    const text = card(f)
    assert.match(text, new RegExp(`^agent: ${harness}-price-the-job$`, 'm'))
    assert.match(text, /^status: doing$/m)
    assert.match(text, new RegExp(`Delegated to ${harness}-price-the-job, a headless ${harness} worker on m-1\\.`))
    assert.ok(text.includes(`Started the worker, process 4242, on card/price-the-job in \`${worktree}\`. Log: \`${log}\`.`))
    assert.ok(text.includes(`Resume: \`${spec.resume}\``))
  })
}

test('a second delegation reuses the worktree on the card branch', async () => {
  const f = seed()
  const root = repo()
  const launches: Launch[] = []
  await delegate(await loadVault(f.root), 'wi-0004', { to: 'codex' }, deps(root, launches))
  await delegate(await loadVault(f.root), 'wi-0004', { to: 'codex' }, deps(root, launches))
  assert.equal(launches.length, 2)
  assert.equal(launches[1]!.spec.cwd, launches[0]!.spec.cwd)
})

test('a branch that exists without a worktree gets one', async () => {
  const f = seed()
  const root = repo()
  execFileSync('git', ['-C', root, 'branch', 'card/price-the-job'])
  const result = await delegate(await loadVault(f.root), 'wi-0004', { to: 'pi' }, deps(root, []))
  assert.equal(execFileSync('git', ['-C', result.worktree!, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), 'card/price-the-job')
})

test('outside a Git repository, an agent delegation writes nothing', async () => {
  const f = seed()
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'wi-nogit-')))
  cleanups.push(() => rmSync(outside, { recursive: true, force: true }))
  const before = card(f)
  await assert.rejects(delegate(await loadVault(f.root), 'wi-0004', { to: 'claude' }, deps(outside, [])),
    /runs in a Git repository/)
  assert.equal(card(f), before)
})

test('a permission the harness does not take writes nothing', async () => {
  const f = seed()
  const root = repo()
  const before = card(f)
  await assert.rejects(delegate(await loadVault(f.root), 'wi-0004', { to: 'pi', permission: 'auto' }, deps(root, [])),
    /pi has no permission modes/)
  assert.equal(card(f), before)
  assert.ok(!existsSync(join(root, '..', 'tools-worktrees')))
})

test('a folder in the way of the worktree writes nothing', async () => {
  const f = seed()
  const root = repo()
  execFileSync('mkdir', ['-p', join(root, '..', 'tools-worktrees', 'price-the-job')])
  const before = card(f)
  await assert.rejects(delegate(await loadVault(f.root), 'wi-0004', { to: 'claude' }, deps(root, [])),
    /is not a worktree of card\/price-the-job/)
  assert.equal(card(f), before)
})

test('when the worker cannot start, the claim is released with the reason', async () => {
  const f = seed()
  const root = repo()
  await assert.rejects(delegate(await loadVault(f.root), 'wi-0004', { to: 'codex' }, deps(root, [], 'spawn codex ENOENT')),
    /spawn codex ENOENT/)
  const text = card(f)
  assert.match(text, /^status: options$/m)
  assert.doesNotMatch(text, /^agent:/m)
  assert.match(text, /Released from codex-price-the-job: wi delegate could not start the worker: spawn codex ENOENT\./)
})

test('--agent names the worker, and the repo name names the worktrees folder', async () => {
  const f = seed()
  const root = repo()
  const result = await delegate(await loadVault(f.root), 'wi-0004', { to: 'claude', agent: 'Opus pricing' }, deps(root, []))
  assert.equal(result.holder, 'Opus pricing')
  assert.equal(basename(join(result.worktree!, '..')), 'tools-worktrees')
})

const CLI = fileURLToPath(new URL('../wi.ts', import.meta.url))

/** Runs wi with a PATH that holds only `bin` and git, so no real agent can start. */
function wi(args: string[], cwd: string, vault: string, bin: string): { code: number; stdout: string; stderr: string } {
  const git = dirname(execFileSync('/usr/bin/which', ['git'], { encoding: 'utf8' }).trim())
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${bin}:${git}:/usr/bin:/bin`, WI_VAULT: vault, WI_CREATOR: 'Session agent', WI_MODEL: 'm-0' },
    })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

function fakeBin(): string {
  const bin = realpathSync(mkdtempSync(join(tmpdir(), 'wi-bin-')))
  cleanups.push(() => rmSync(bin, { recursive: true, force: true }))
  // A stand-in for the harness: it prints what it was given, and nothing else.
  writeFileSync(join(bin, 'claude'), '#!/bin/sh\necho "args: $*"\necho "agent: $WI_AGENT card: $WI_CARD"\ncat\necho FAKE-DONE\n', { mode: 0o755 })
  return bin
}

test('wi delegate --to a person needs no Git repository and prints the holder', () => {
  const f = seed()
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'wi-nogit-')))
  cleanups.push(() => rmSync(outside, { recursive: true, force: true }))
  const result = wi(['delegate', 'Price the job', '--to', 'Ana'], outside, f.root, fakeBin())
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /wi-0004.*options {2}\(assigned to Ana\)/)
  assert.doesNotMatch(card(f), /Delegated to Ana/)
})

test('wi delegate refuses --reason with exit 2: the brief belongs on the card', () => {
  const f = seed()
  const result = wi(['delegate', 'Price the job', '--to', 'Ana', '--reason', 'why'], f.root, f.root, fakeBin())
  assert.equal(result.code, 2)
  assert.match(result.stderr, /--reason/)
})

test('wi delegate refuses an unknown --to with exit 2 and writes nothing', () => {
  const f = seed()
  const before = card(f)
  const result = wi(['delegate', 'wi-0004', '--to', 'gpt'], repo(), f.root, fakeBin())
  assert.equal(result.code, 2)
  assert.match(result.stderr, /no person note called gpt/)
  assert.equal(card(f), before)
})

test('wi delegate --to claude starts the harness detached, with the brief on stdin and its output in the log', async () => {
  const f = seed()
  const root = repo()
  const result = wi(['delegate', 'wi-0004', '--to', 'claude', '--model', 'm-1', '--json'], root, f.root, fakeBin())
  assert.equal(result.code, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.holder, 'claude-price-the-job')
  assert.equal(report.branch, 'card/price-the-job')
  assert.equal(typeof report.pid, 'number')

  let log = ''
  for (let i = 0; i < 50 && !log.includes('FAKE-DONE'); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    log = existsSync(report.log) ? readFileSync(report.log, 'utf8') : ''
  }
  assert.match(log, /^=== .* claude -p --model m-1 --permission-mode auto --session-id \S+ --name wi-0004 Price the job --add-dir /m)
  assert.match(log, /agent: claude-price-the-job card: wi-0004/)
  assert.match(log, /You are claude-price-the-job, a worker on the card wi-0004/)
  assert.ok(existsSync(join(dirname(report.log), 'price-the-job.prompt.md')))
  assert.match(card(f), /Started the worker, process \d+, on card\/price-the-job/)
})
