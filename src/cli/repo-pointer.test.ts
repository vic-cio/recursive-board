import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('./wi.ts', import.meta.url))

interface Sandbox {
  root: string
  config: string
  repo: string
  vault: string
  secondVault: string
  git(cwd: string, ...args: string[]): void
  writeVault(path: string, title: string): void
  cleanup(): void
}

function sandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'wi-pointer-'))
  const config = join(root, 'xdg')
  const repo = join(root, 'repo')
  const vault = join(root, 'vault')
  const secondVault = join(root, 'other-vault')
  mkdirSync(repo, { recursive: true })
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })
  git(repo, 'init', '-q')
  const writeVault = (path: string, title: string) => {
    mkdirSync(join(path, 'Boards'), { recursive: true })
    writeFileSync(join(path, 'Boards', 'Main.md'), `---\ntype: work-item\nid: wi-test\ntitle: ${title}\ncreated: 2026-09-24\nupdated: 2026-09-24\n---\n`)
  }
  writeVault(vault, 'First')
  writeFileSync(join(vault, 'Boards', 'Extra.md'), '---\ntype: work-item\nid: wi-extra\ntitle: Extra\nparent: "[[Main]]"\ncreated: 2026-09-24\nupdated: 2026-09-24\n---\n')
  writeVault(secondVault, 'Second')
  return {
    root, config, repo, vault, secondVault, git, writeVault,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

async function wi(args: string[], cwd: string, env: Record<string, string | undefined>) {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...process.env, HOME: env.HOME, XDG_CONFIG_HOME: env.XDG_CONFIG_HOME, WI_VAULT: env.WI_VAULT },
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string }
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

function envFor(s: Sandbox, values: Record<string, string | undefined> = {}) {
  return { HOME: s.root, XDG_CONFIG_HOME: s.config, WI_VAULT: undefined, ...values }
}

test('vault lookup follows flag, WI_VAULT, nearest vault, repo pointer, then defaultVault', async () => {
  const s = sandbox()
  try {
    const env = envFor(s)
    const explicit = await wi(['validate', '--vault', s.secondVault], s.repo, { ...env, WI_VAULT: s.vault })
    assert.match(explicit.stdout, /1 work items/)

    const fromEnv = await wi(['validate'], s.repo, { ...env, WI_VAULT: s.vault })
    assert.match(fromEnv.stdout, /2 work items/)

    const nested = join(s.repo, 'nested')
    mkdirSync(nested)
    mkdirSync(join(nested, 'Boards'))
    writeFileSync(join(nested, 'Boards', 'Nested.md'), '---\ntype: work-item\nid: wi-nested\ntitle: Nested\ncreated: 2026-09-24\nupdated: 2026-09-24\n---\n')
    const nearest = await wi(['validate'], nested, env)
    assert.match(nearest.stdout, /1 work items/)
    rmSync(join(nested, 'Boards'), { recursive: true })

    await wi(['here', '--vault', s.vault, '--board', 'Main'], s.repo, env)
    const mapped = await wi(['validate'], s.repo, env)
    assert.match(mapped.stdout, /2 work items/)
    mkdirSync(join(nested, 'Boards'))
    writeFileSync(join(nested, 'Boards', 'Nested.md'), '---\ntype: work-item\nid: wi-nested\ntitle: Nested\ncreated: 2026-09-24\nupdated: 2026-09-24\n---\n')
    const nearestBeforePointer = await wi(['validate'], nested, env)
    assert.match(nearestBeforePointer.stdout, /1 work items/)
    rmSync(join(nested, 'Boards'), { recursive: true })

    mkdirSync(join(s.config, 'wi'), { recursive: true })
    writeFileSync(join(s.config, 'wi', 'config.json'), JSON.stringify({ defaultVault: s.secondVault }))
    rmSync(join(s.config, 'wi', 'repos.json'), { force: true })
    const fallback = await wi(['validate'], s.repo, env)
    assert.match(fallback.stdout, /1 work items/)
  } finally {
    s.cleanup()
  }
})

test('wi here writes outside the repo and is shared by linked worktrees', async () => {
  const s = sandbox()
  try {
    const env = envFor(s)
    const worktree = join(s.root, 'worktree')
    s.git(s.repo, 'worktree', 'add', '-qb', 'linked', worktree)
    const set = await wi(['here', '--vault', s.vault, '--board', 'Main'], worktree, env)
    assert.equal(set.code, 0, set.stderr)
    const configPath = join(s.config, 'wi', 'repos.json')
    const repoMap = JSON.parse(readFileSync(configPath, 'utf8'))
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: s.repo, encoding: 'utf8' }).trim()
    assert.deepEqual(repoMap[realpathSync(resolve(s.repo, commonDir))], { vault: s.vault, board: 'wi-test' })
    assert.equal(readFileSync(join(s.repo, '.git', 'config'), 'utf8').includes(s.vault), false)
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: s.repo, encoding: 'utf8' }).trim(), '')

    const shown = await wi(['here'], s.repo, env)
    assert.ok(shown.stdout.includes(s.vault))
    const used = await wi(['new', 'From pointer', '--json'], worktree, env)
    assert.equal(used.code, 0, used.stderr)
    assert.equal(JSON.parse(used.stdout).path, 'Boards/From pointer.md')
  } finally {
    s.cleanup()
  }
})

test('repo pointer supplies the default parent for wi new and wi children', async () => {
  const s = sandbox()
  try {
    const env = envFor(s)
    await wi(['here', '--vault', s.vault, '--board', 'Main'], s.repo, env)
    const created = await wi(['new', 'Pointer child', '--json'], s.repo, env)
    assert.equal(created.code, 0, created.stderr)
    const children = await wi(['children', '--json'], s.repo, env)
    assert.equal(children.code, 0, children.stderr)
    assert.ok(JSON.parse(children.stdout).children.some((item: { title: string }) => item.title === 'Pointer child'))
  } finally {
    s.cleanup()
  }
})

test('wi here appears in help and rejects invocation outside a Git repo', async () => {
  const s = sandbox()
  try {
    const help = await wi(['--help'], s.repo, envFor(s))
    assert.match(help.stdout, /wi here \[--board <ref>\] \[--vault <path>\]/)
    const outside = await wi(['here'], s.root, envFor(s))
    assert.notEqual(outside.code, 0)
    assert.match(outside.stderr, /Git repository/i)
  } finally {
    s.cleanup()
  }
})
