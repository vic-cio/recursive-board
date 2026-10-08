import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { detectObsidianRegistryPath, rankObsidianVaults, readObsidianVaults, setupSummary } from './setup.ts'
import { playbookBlock } from '../../shared/playbook.ts'

const run = promisify(execFile)

test('Obsidian registry paths follow macOS, Linux, and Windows conventions', () => {
  const home = '/tmp/agent-home'
  assert.equal(detectObsidianRegistryPath({ platform: 'darwin', home }),
    join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json'))
  assert.equal(detectObsidianRegistryPath({ platform: 'linux', home }),
    join(home, '.config', 'obsidian', 'obsidian.json'))
  assert.equal(detectObsidianRegistryPath({ platform: 'win32', home, appData: 'C:\\Users\\agent\\AppData\\Roaming' }),
    join('C:\\Users\\agent\\AppData\\Roaming', 'obsidian', 'obsidian.json'))
})

test('setup --yes --vault installs both skill copies and writes config under temp HOME', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wi-setup-home-'))
  const vault = mkdtempSync(join(tmpdir(), 'wi-setup-vault-'))
  const entry = fileURLToPath(new URL('../wi.ts', import.meta.url))
  const configRoot = join(home, '.config', 'wi')

  try {
    await run('node', [entry, 'setup', '--yes', '--vault', vault], {
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config') },
    })
    assert.deepEqual(JSON.parse(readFileSync(join(configRoot, 'config.json'), 'utf8')),
      { defaultVault: vault })
    for (const folder of [join(home, '.claude', 'skills', 'recursive-board'),
      join(home, '.agents', 'skills', 'recursive-board')]) {
      assert.match(readFileSync(join(folder, 'SKILL.md'), 'utf8'), /^---\nname: recursive-board/m)
      assert.ok(readFileSync(join(folder, '.recursive-board-managed'), 'utf8').length > 0)
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(vault, { recursive: true, force: true })
  }
})

test('vault registry parser reads fixture registries for each platform layout', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wi-registry-home-'))
  try {
    const fixtures = [
      { platform: 'darwin', home },
      { platform: 'linux', home },
      { platform: 'win32', home, appData: join(home, 'roaming') },
    ] as const
    for (const location of fixtures) {
      const platform = location.platform
      const registry = detectObsidianRegistryPath(location)
      mkdirSync(join(registry, '..'), { recursive: true })
      writeFileSync(registry, JSON.stringify({ vaults: { abc: { path: join(home, platform, 'vault') } } }))
      const vaults = await readObsidianVaults(location)
      assert.deepEqual(vaults, [join(home, platform, 'vault')])
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('vault ranking puts a vault with work items first', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wi-vault-ranking-'))
  const empty = join(root, 'empty')
  const populated = join(root, 'populated')
  mkdirSync(join(empty, 'Boards'), { recursive: true })
  mkdirSync(join(populated, 'Boards'), { recursive: true })
  writeFileSync(join(populated, 'Boards', 'Main.md'), '---\ntype: work-item\nid: wi-test\ntitle: Main\n---\n')
  try {
    assert.deepEqual(await rankObsidianVaults([empty, populated]), [populated, empty])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function listFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort()
}

function setupEnv(home: string): NodeJS.ProcessEnv {
  return { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config') }
}

test('setup prints the recommended setup, the playbook path and wi doctor', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wi-setup-home-'))
  const vault = mkdtempSync(join(tmpdir(), 'wi-setup-vault-'))
  const entry = fileURLToPath(new URL('../wi.ts', import.meta.url))
  const playbook = fileURLToPath(new URL('../../../docs/playbook.md', import.meta.url))
  const summary = playbookBlock(readFileSync(playbook, 'utf8'), 'summary')
  assert.ok(summary)
  try {
    for (const args of [['--yes', '--vault', vault], ['--vault', vault]]) {
      const { stdout } = await run('node', [entry, 'setup', ...args], { env: setupEnv(home), timeout: 20_000 })
      assert.ok(stdout.includes(summary), `wi setup ${args.join(' ')} prints the summary block`)
      assert.ok(stdout.includes(`Playbook: ${playbook}`), 'it names the installed playbook')
      assert.match(stdout, /wi doctor/)
      assert.ok(stdout.indexOf('wi setup: default vault') < stdout.indexOf(summary), 'the summary follows the vault choice')
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(vault, { recursive: true, force: true })
  }
})

test('setup writes nothing into the vault', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wi-setup-home-'))
  const vault = mkdtempSync(join(tmpdir(), 'wi-setup-vault-'))
  const entry = fileURLToPath(new URL('../wi.ts', import.meta.url))
  mkdirSync(join(vault, 'Boards'))
  writeFileSync(join(vault, 'Boards', 'Main.md'), '---\ntype: work-item\nid: wi-test\ntitle: Main\n---\n')
  writeFileSync(join(vault, 'Note.md'), 'A note.\n')
  const before = listFiles(vault)
  try {
    await run('node', [entry, 'setup', '--yes', '--vault', vault], { env: setupEnv(home), timeout: 20_000 })
    await run('node', [entry, 'setup', '--json', '--vault', vault], { env: setupEnv(home), timeout: 20_000 })
    assert.deepEqual(listFiles(vault), before)
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(vault, { recursive: true, force: true })
  }
})

test('setup --yes asks nothing, even for a Git vault', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wi-setup-home-'))
  const vault = mkdtempSync(join(tmpdir(), 'wi-setup-vault-'))
  const entry = fileURLToPath(new URL('../wi.ts', import.meta.url))
  await run('git', ['init', '-q', vault])
  try {
    const child = execFile('node', [entry, 'setup', '--yes', '--vault', vault], { env: setupEnv(home), timeout: 20_000 })
    child.stdin?.end()
    let stdout = ''
    child.stdout?.on('data', (chunk: string) => { stdout += chunk })
    const code = await new Promise((resolve) => child.on('close', resolve))
    assert.equal(code, 0)
    assert.doesNotMatch(stdout, /\?/, 'no question is printed')
    assert.match(stdout, /Recommended agent setup/)
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(vault, { recursive: true, force: true })
  }
})

test('setup makes no git hook offer, even when a person answers yes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wi-setup-home-'))
  const vault = mkdtempSync(join(tmpdir(), 'wi-setup-vault-'))
  const entry = fileURLToPath(new URL('../wi.ts', import.meta.url))
  await run('git', ['init', '-q', vault])
  try {
    const child = execFile('node', [entry, 'setup', '--vault', vault], { env: setupEnv(home), timeout: 20_000 })
    child.stdin?.end('yes\nyes\n')
    let stdout = ''
    child.stdout?.on('data', (chunk: string) => { stdout += chunk })
    const code = await new Promise((resolve) => child.on('close', resolve))
    assert.equal(code, 0)
    assert.doesNotMatch(stdout, /\?|hook/i, 'setup asks nothing and names no hook')
    assert.equal(existsSync(join(vault, '.git', 'hooks', 'pre-commit')), false, 'setup writes no pre-commit hook')
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(vault, { recursive: true, force: true })
  }
})

test('setup --json prints one object with the recommended setup, and needs --vault', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wi-setup-home-'))
  const vault = mkdtempSync(join(tmpdir(), 'wi-setup-vault-'))
  const entry = fileURLToPath(new URL('../wi.ts', import.meta.url))
  const playbook = fileURLToPath(new URL('../../../docs/playbook.md', import.meta.url))
  try {
    const { stdout } = await run('node', [entry, 'setup', '--json', '--vault', vault], { env: setupEnv(home), timeout: 20_000 })
    const result = JSON.parse(stdout)
    assert.equal(result.vault, vault)
    assert.equal(result.config, join(home, '.config', 'wi', 'config.json'))
    assert.deepEqual(result.skills.map((skill: { outcome: string }) => skill.outcome), ['installed', 'installed'])
    assert.equal(result.recommendedSetup.summary, playbookBlock(readFileSync(playbook, 'utf8'), 'summary'))
    assert.equal(result.recommendedSetup.playbook, playbook)
    assert.equal(result.recommendedSetup.check, 'wi doctor')

    await assert.rejects(run('node', [entry, 'setup', '--json'], { env: setupEnv(home), timeout: 20_000 }),
      (error: { code: number; stderr: string }) => error.code === 2 && /--json needs --vault/.test(error.stderr))
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(vault, { recursive: true, force: true })
  }
})

test('the setup summary is the playbook block, the path and the check, or nothing without a playbook', () => {
  const text = 'Intro.\n\n```text playbook=summary\nLine one.\nLine two.\n```\n'
  assert.equal(setupSummary(text, '/pkg/docs/playbook.md'),
    'Line one.\nLine two.\n\nPlaybook: /pkg/docs/playbook.md\nCheck a vault against it: wi doctor\n')
  assert.equal(setupSummary(null, '/pkg/docs/playbook.md'), null)
  assert.equal(setupSummary('No blocks here.\n', '/pkg/docs/playbook.md'), null)
})
