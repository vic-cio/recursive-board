/** Exercise the validation hook against a temporary Git repository. */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { makeVault, item, type Fixture } from './test-helpers.ts'

const run = promisify(execFile)
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const tool = join(repo, 'src', 'cli', 'wi.ts')

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

interface Result { code: number; stdout: string; stderr: string }

async function attempt(cmd: string, args: string[], cwd: string): Promise<Result> {
  try {
    const { stdout, stderr } = await run(cmd, args, { cwd })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string }
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

async function vaultRepo(): Promise<Fixture> {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-21',
  }, 'Root.\n'))
  await run('git', ['init', '-q', '-b', 'main'], { cwd: f.root })
  await run('git', ['config', 'user.email', 'test@example.invalid'], { cwd: f.root })
  await run('git', ['config', 'user.name', 'Test'], { cwd: f.root })
  await run('git', ['config', 'commit.gpgsign', 'false'], { cwd: f.root })
  return f
}

const breakTheVault = (f: Fixture) =>
  f.write('Boards/Broken.md', item({
    type: 'work-item', id: 'wi-0009', title: 'Broken', status: 'active',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))

test('wi hook install writes an executable pre-commit hook', async () => {
  fixture = await vaultRepo()
  const result = await attempt('node', [tool, 'hook', 'install', '--vault', fixture.root], repo)
  assert.equal(result.code, 0, result.stderr)
  const hook = join(fixture.root, '.git/hooks/pre-commit')
  assert.ok(existsSync(hook))
  const body = readFileSync(hook, 'utf8')
  assert.ok(body.includes(process.execPath))
  assert.ok(body.includes(tool))
  assert.match(body, /validate --vault/)
})

test('status reports the hook once it is installed', async () => {
  fixture = await vaultRepo()
  await attempt('node', [tool, 'hook', 'install', '--vault', fixture.root], repo)
  const { stdout } = await attempt('node', [tool, 'hook', 'status', '--vault', fixture.root], repo)
  assert.match(stdout, /pre-commit\s+installed/)
})

test('a healthy vault commits through the hook', async () => {
  fixture = await vaultRepo()
  await attempt('node', [tool, 'hook', 'install', '--vault', fixture.root], repo)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const result = await attempt('git', ['commit', '-m', 'first'], fixture.root)
  assert.equal(result.code, 0, result.stdout + result.stderr)
})

test('the hook refuses a commit that would record an invalid vault', async () => {
  fixture = await vaultRepo()
  await attempt('node', [tool, 'hook', 'install', '--vault', fixture.root], repo)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  await run('git', ['commit', '-m', 'first'], { cwd: fixture.root })

  breakTheVault(fixture)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const result = await attempt('git', ['commit', '-m', 'second'], fixture.root)
  assert.notEqual(result.code, 0, 'the hook let an invalid vault through')
  assert.match(result.stdout + result.stderr, /status-invalid/)
})

test('--no-verify is the documented way past it', async () => {
  fixture = await vaultRepo()
  await attempt('node', [tool, 'hook', 'install', '--vault', fixture.root], repo)
  breakTheVault(fixture)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const result = await attempt('git', ['commit', '--no-verify', '-m', 'anyway'], fixture.root)
  assert.equal(result.code, 0, result.stderr)
})

test('wi hook install refuses to clobber a hook it did not write', async () => {
  fixture = await vaultRepo()
  fixture.write('.git/hooks/pre-commit', '#!/bin/sh\necho someone elses hook\n')
  const result = await attempt('node', [tool, 'hook', 'install', '--vault', fixture.root], repo)
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /--force/)
  assert.equal(readFileSync(join(fixture.root, '.git/hooks/pre-commit'), 'utf8'), '#!/bin/sh\necho someone elses hook\n')
})

test('--force replaces a hook it did not write', async () => {
  fixture = await vaultRepo()
  fixture.write('.git/hooks/pre-commit', '#!/bin/sh\necho someone elses hook\n')
  const result = await attempt('node', [tool, 'hook', 'install', '--force', '--vault', fixture.root], repo)
  assert.equal(result.code, 0, result.stderr)
  assert.match(readFileSync(join(fixture.root, '.git/hooks/pre-commit'), 'utf8'), /installed by scripts\/vault-git\.mjs/)
})

test('install replaces a legacy hook without force', async () => {
  fixture = await vaultRepo()
  fixture.write('.git/hooks/pre-commit', '#!/bin/sh\n# installed by scripts/vault-git.mjs\nexit 0\n')
  const result = await attempt('node', [tool, 'hook', 'install', '--vault', fixture.root], repo)
  assert.equal(result.code, 0, result.stderr)
  assert.ok(readFileSync(join(fixture.root, '.git/hooks/pre-commit'), 'utf8').includes(tool))
})

test('bundled wi installs a hook that runs the bundled entry point', async () => {
  fixture = await vaultRepo()
  await run(process.execPath, [join(repo, 'build/wi.mjs')], { cwd: repo })
  const bundle = join(repo, 'dist/wi/wi.js')
  const installed = await attempt(process.execPath, [bundle, 'hook', 'install', '--vault', fixture.root], repo)
  assert.equal(installed.code, 0, installed.stderr)
  const body = readFileSync(join(fixture.root, '.git/hooks/pre-commit'), 'utf8')
  assert.ok(body.includes(process.execPath))
  assert.ok(body.includes(bundle))
  assert.ok(!body.includes(tool))
  breakTheVault(fixture)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const commit = await attempt('git', ['commit', '-m', 'broken'], fixture.root)
  assert.notEqual(commit.code, 0)
  assert.match(commit.stdout + commit.stderr, /status-invalid/)
})

test('uninstall leaves another pre-commit hook alone', async () => {
  fixture = await vaultRepo()
  fixture.write('.git/hooks/pre-commit', '#!/bin/sh\necho someone elses hook\n')
  const result = await attempt('node', [tool, 'hook', 'uninstall', '--vault', fixture.root], repo)
  assert.equal(result.code, 0, result.stderr)
  assert.equal(readFileSync(join(fixture.root, '.git/hooks/pre-commit'), 'utf8'), '#!/bin/sh\necho someone elses hook\n')
})

test('wi --help lists hook management', async () => {
  const result = await attempt('node', [tool, '--help'], repo)
  assert.equal(result.code, 0)
  assert.match(result.stdout, /wi hook <install\|uninstall\|status>/)
})

test('--force is rejected outside hook install', async () => {
  fixture = await vaultRepo()
  const result = await attempt('node', [tool, 'validate', '--force', '--vault', fixture.root], repo)
  assert.equal(result.code, 2)
  assert.match(result.stderr, /--force applies only to wi hook install/)
})

test('uninstall removes an installed hook', async () => {
  fixture = await vaultRepo()
  await attempt('node', [tool, 'hook', 'install', '--vault', fixture.root], repo)
  const hook = join(fixture.root, '.git/hooks/pre-commit')
  assert.ok(existsSync(hook))

  const result = await attempt('node', [tool, 'hook', 'uninstall', '--vault', fixture.root], repo)
  assert.equal(result.code, 0, result.stderr)
  assert.ok(!existsSync(hook))
})
