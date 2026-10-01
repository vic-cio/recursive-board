import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('./wi.ts', import.meta.url))

interface Sandbox {
  root: string
  config: string
  repo: string
  vault: string
  secondVault: string
  /** Writes the repo map that wi here used to keep, so a test can show that nothing reads it. */
  writeOldPointer(): void
  writeDefaultVault(path: string): void
  cleanup(): void
}

function sandbox(): Sandbox {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wi-lookup-')))
  const config = join(root, 'xdg')
  const repo = join(root, 'repo')
  const vault = join(root, 'vault')
  const secondVault = join(root, 'other-vault')
  mkdirSync(repo, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' })
  const writeVault = (path: string, title: string) => {
    mkdirSync(join(path, 'Boards'), { recursive: true })
    writeFileSync(join(path, 'Boards', 'Main.md'), `---\ntype: work-item\nid: wi-test\ntitle: ${title}\ncreated: 2026-09-24\nupdated: 2026-09-24\n---\n`)
  }
  writeVault(vault, 'First')
  writeFileSync(join(vault, 'Boards', 'Extra.md'), '---\ntype: work-item\nid: wi-extra\ntitle: Extra\nparent: "[[Main]]"\ncreated: 2026-09-24\nupdated: 2026-09-24\n---\n')
  writeVault(secondVault, 'Second')
  const writeConfig = (name: string, value: unknown) => {
    mkdirSync(join(config, 'wi'), { recursive: true })
    writeFileSync(join(config, 'wi', name), JSON.stringify(value))
  }
  return {
    root, config, repo, vault, secondVault,
    writeOldPointer: () => writeConfig('repos.json', { [join(repo, '.git')]: { vault, board: 'wi-test' } }),
    writeDefaultVault: (path) => writeConfig('config.json', { defaultVault: path }),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

async function wi(args: string[], cwd: string, s: Sandbox, wiVault?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: s.root, XDG_CONFIG_HOME: s.config }
  delete env['WI_VAULT']
  if (wiVault !== undefined) env['WI_VAULT'] = wiVault
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd, env })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string }
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

test('vault lookup takes --vault, then WI_VAULT, then the enclosing vault, then defaultVault', async () => {
  const s = sandbox()
  try {
    // The first vault holds two work items and the second holds one, so the count names the vault.
    s.writeDefaultVault(s.vault)
    const nested = join(s.secondVault, 'Boards')

    const flag = await wi(['validate', '--vault', s.secondVault], s.repo, s, s.vault)
    assert.match(flag.stdout, /1 work items/, '--vault wins over WI_VAULT')

    const fromEnv = await wi(['validate'], nested, s, s.vault)
    assert.match(fromEnv.stdout, /2 work items/, 'WI_VAULT wins over the enclosing vault')

    const enclosing = await wi(['validate'], nested, s)
    assert.match(enclosing.stdout, /1 work items/, 'the enclosing vault wins over defaultVault')

    const fallback = await wi(['validate'], s.repo, s)
    assert.match(fallback.stdout, /2 work items/, 'defaultVault is the last source')
  } finally {
    s.cleanup()
  }
})

test('vault lookup ignores the old repo pointer', async () => {
  const s = sandbox()
  try {
    s.writeOldPointer()
    const none = await wi(['validate'], s.repo, s)
    assert.equal(none.code, 2)
    assert.match(none.stderr, /no vault found/)
    assert.match(none.stderr, /--vault <path>.*WI_VAULT.*defaultVault/s)
    assert.doesNotMatch(none.stderr, /wi here/)

    s.writeDefaultVault(s.secondVault)
    const fallback = await wi(['validate'], s.repo, s)
    assert.match(fallback.stdout, /1 work items/)
  } finally {
    s.cleanup()
  }
})

test('wi here is retired: it exits 0, names the new way, and writes nothing', async () => {
  const s = sandbox()
  try {
    for (const args of [['here'], ['here', '--vault', s.vault, '--board', 'Main'], ['here', '--json']]) {
      for (const cwd of [s.repo, s.root]) {
        const result = await wi(args, cwd, s)
        assert.equal(result.code, 0, result.stderr)
        assert.match(result.stdout, /AGENTS\.md names its board/)
        assert.match(result.stdout, /--parent/)
      }
    }
    assert.equal(existsSync(join(s.config, 'wi', 'repos.json')), false)
  } finally {
    s.cleanup()
  }
})

test('wi new without --parent takes defaultRoot only, never the old repo pointer', async () => {
  const s = sandbox()
  try {
    s.writeOldPointer()
    const refused = await wi(['new', 'Orphan'], s.repo, s, s.vault)
    assert.equal(refused.code, 2)
    assert.match(refused.stderr, /--parent <ref>/)
    assert.match(refused.stderr, /defaultRoot/)
    assert.doesNotMatch(refused.stderr, /pointer/)

    mkdirSync(join(s.vault, '.obsidian', 'plugins', 'recursive-board'), { recursive: true })
    writeFileSync(join(s.vault, '.obsidian', 'plugins', 'recursive-board', 'data.json'), JSON.stringify({ board: { defaultRoot: 'Extra' } }))
    const created = await wi(['new', 'Under the root', '--json'], s.repo, s, s.vault)
    assert.equal(created.code, 0, created.stderr)
    assert.equal(JSON.parse(created.stdout).parent, 'Extra')
  } finally {
    s.cleanup()
  }
})

test('wi children needs a <ref>, and the old repo pointer does not supply one', async () => {
  const s = sandbox()
  try {
    s.writeOldPointer()
    const result = await wi(['children'], s.repo, s, s.vault)
    assert.equal(result.code, 2)
    assert.match(result.stderr, /wi children needs a <ref>/)
    assert.doesNotMatch(result.stderr, /pointer/)
  } finally {
    s.cleanup()
  }
})

test('help lists wi here as retired and the four vault sources', async () => {
  const s = sandbox()
  try {
    const help = await wi(['--help'], s.repo, s)
    assert.doesNotMatch(help.stdout, /wi here \[--board/)
    assert.match(help.stdout, /\$WI_VAULT, the vault this folder is in, then defaultVault/)
  } finally {
    s.cleanup()
  }
})
