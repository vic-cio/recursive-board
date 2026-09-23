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
const tool = join(repo, 'scripts', 'vault-git.mjs')

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

test('install-hook writes an executable pre-commit hook', async () => {
  fixture = await vaultRepo()
  const result = await attempt('node', [tool, 'install-hook', '--vault', fixture.root], repo)
  assert.equal(result.code, 0, result.stderr)
  const hook = join(fixture.root, '.git/hooks/pre-commit')
  assert.ok(existsSync(hook))
  assert.match(readFileSync(hook, 'utf8'), /wi\.ts.*validate/)
})

test('status reports the hook once it is installed', async () => {
  fixture = await vaultRepo()
  await attempt('node', [tool, 'install-hook', '--vault', fixture.root], repo)
  const { stdout } = await attempt('node', [tool, 'status', '--vault', fixture.root], repo)
  assert.match(stdout, /pre-commit\s+installed/)
})

test('a healthy vault commits through the hook', async () => {
  fixture = await vaultRepo()
  await attempt('node', [tool, 'install-hook', '--vault', fixture.root], repo)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const result = await attempt('git', ['commit', '-m', 'first'], fixture.root)
  assert.equal(result.code, 0, result.stdout + result.stderr)
})

test('the hook refuses a commit that would record an invalid vault', async () => {
  fixture = await vaultRepo()
  await attempt('node', [tool, 'install-hook', '--vault', fixture.root], repo)
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
  await attempt('node', [tool, 'install-hook', '--vault', fixture.root], repo)
  breakTheVault(fixture)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const result = await attempt('git', ['commit', '--no-verify', '-m', 'anyway'], fixture.root)
  assert.equal(result.code, 0, result.stderr)
})

test('install-hook refuses to clobber a hook it did not write', async () => {
  fixture = await vaultRepo()
  fixture.write('.git/hooks/pre-commit', '#!/bin/sh\necho someone elses hook\n')
  const result = await attempt('node', [tool, 'install-hook', '--vault', fixture.root], repo)
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /--force/)
})

test('uninstall removes an installed hook', async () => {
  fixture = await vaultRepo()
  await attempt('node', [tool, 'install-hook', '--vault', fixture.root], repo)
  const hook = join(fixture.root, '.git/hooks/pre-commit')
  assert.ok(existsSync(hook))

  const result = await attempt('node', [tool, 'uninstall', '--vault', fixture.root], repo)
  assert.equal(result.code, 0, result.stderr)
  assert.ok(!existsSync(hook))
})
