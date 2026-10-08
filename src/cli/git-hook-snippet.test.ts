/**
 * Run the pre-commit snippet from docs/playbook.md against a temporary Git repository.
 *
 * Git versioning is advice (docs/adr/0075-git-versioning-is-advice.md). The snippet is the only
 * code the advice carries, so these tests hold it to what the playbook says it does.
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { makeVault, item, type Fixture } from './test-helpers.ts'
import { playbookBlock } from '../shared/playbook.ts'

const run = promisify(execFile)
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const tool = join(repo, 'src', 'cli', 'wi.ts')
const snippet = playbookBlock(readFileSync(join(repo, 'docs', 'playbook.md'), 'utf8'), 'git-hook')

const NODE = '/absolute/path/to/node'
const WI = '/absolute/path/to/wi.js'
const VAULT = '/absolute/path/to/vault'
/** A GUI Git client starts hooks without the shell PATH, so the snippet must not need it. */
const GUI_PATH = '/usr/bin:/bin'

let fixture: Fixture | undefined
let spare: string | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
  if (spare) rmSync(spare, { recursive: true, force: true })
  spare = undefined
})

interface Result { code: number; stdout: string; stderr: string }

async function attempt(cmd: string, args: string[], cwd: string): Promise<Result> {
  try {
    const { stdout, stderr } = await run(cmd, args, { cwd, env: { ...process.env, PATH: GUI_PATH } })
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

/** The snippet with its three placeholder paths filled in, saved as the repo's pre-commit hook. */
function installSnippet(f: Fixture, paths: { node: string; wi: string; vault: string }): void {
  assert.ok(snippet, 'the playbook has a git-hook block')
  const body = snippet.replaceAll(NODE, paths.node).replaceAll(WI, paths.wi).replaceAll(VAULT, paths.vault)
  const hook = f.write('.git/hooks/pre-commit', `${body}\n`)
  chmodSync(hook, 0o755)
}

const installFromSource = (f: Fixture) => installSnippet(f, { node: process.execPath, wi: tool, vault: f.root })

const breakTheVault = (f: Fixture) =>
  f.write('Boards/Broken.md', item({
    type: 'work-item', id: 'wi-0009', title: 'Broken', status: 'active',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))

test('the playbook marks a git-hook snippet: a shell script that validates with three absolute paths', () => {
  assert.ok(snippet, 'the playbook has a git-hook block')
  assert.match(snippet, /^#!\/bin\/sh\n/)
  assert.match(snippet, /\bvalidate\b/)
  assert.match(snippet, /git commit --no-verify/, 'it says how to skip the check once')
  for (const placeholder of [NODE, WI, VAULT]) {
    assert.ok(snippet.includes(`"${placeholder}"`), `${placeholder} is named, in double quotes`)
  }
})

test('a healthy vault commits through the snippet', async () => {
  fixture = await vaultRepo()
  installFromSource(fixture)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const result = await attempt('git', ['commit', '-m', 'first'], fixture.root)
  assert.equal(result.code, 0, result.stdout + result.stderr)
})

test('the snippet refuses a commit that would record an invalid vault', async () => {
  fixture = await vaultRepo()
  installFromSource(fixture)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  await run('git', ['commit', '-m', 'first'], { cwd: fixture.root, env: { ...process.env, PATH: GUI_PATH } })

  breakTheVault(fixture)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const result = await attempt('git', ['commit', '-m', 'second'], fixture.root)
  assert.notEqual(result.code, 0, 'the hook let an invalid vault through')
  assert.match(result.stdout + result.stderr, /status-invalid/)
})

test('--no-verify is the documented way past the snippet', async () => {
  fixture = await vaultRepo()
  installFromSource(fixture)
  breakTheVault(fixture)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const result = await attempt('git', ['commit', '--no-verify', '-m', 'anyway'], fixture.root)
  assert.equal(result.code, 0, result.stderr)
})

test('the snippet works when the node, wi and vault paths hold spaces', async () => {
  fixture = await vaultRepo()
  spare = mkdtempSync(join(tmpdir(), 'wi hook spaces '))
  mkdirSync(join(spare, 'my wi'))
  symlinkSync(tool, join(spare, 'my wi', 'wi.ts'))
  symlinkSync(fixture.root, join(spare, 'my vault'))
  symlinkSync(process.execPath, join(spare, 'my node'))
  installSnippet(fixture, { node: join(spare, 'my node'), wi: join(spare, 'my wi', 'wi.ts'), vault: join(spare, 'my vault') })

  breakTheVault(fixture)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const result = await attempt('git', ['commit', '-m', 'broken'], fixture.root)
  assert.notEqual(result.code, 0)
  assert.match(result.stdout + result.stderr, /status-invalid/)
})

test('the snippet runs the bundled wi that npm installs', async () => {
  fixture = await vaultRepo()
  await run(process.execPath, [join(repo, 'build/wi.mjs')], { cwd: repo })
  installSnippet(fixture, { node: process.execPath, wi: join(repo, 'dist/wi/wi.js'), vault: fixture.root })

  breakTheVault(fixture)
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const refused = await attempt('git', ['commit', '-m', 'broken'], fixture.root)
  assert.notEqual(refused.code, 0)
  assert.match(refused.stdout + refused.stderr, /status-invalid/)

  rmSync(join(fixture.root, 'Boards/Broken.md'))
  await run('git', ['add', '-A'], { cwd: fixture.root })
  const accepted = await attempt('git', ['commit', '-m', 'fixed'], fixture.root)
  assert.equal(accepted.code, 0, accepted.stdout + accepted.stderr)
})

test('wi hook is an unknown command and installs nothing', async () => {
  fixture = await vaultRepo()
  for (const args of [['install'], ['install', '--force'], ['uninstall'], ['status']]) {
    await assert.rejects(
      run(process.execPath, [tool, 'hook', ...args, '--vault', fixture.root], { cwd: repo }),
      (error: { code?: number; stderr?: string }) => error.code === 2 && /unknown command "hook"/.test(error.stderr ?? ''),
    )
    assert.equal(existsSync(join(fixture.root, '.git/hooks/pre-commit')), false, `wi hook ${args.join(' ')} wrote a hook`)
  }
})
