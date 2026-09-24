import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { detectObsidianRegistryPath, rankObsidianVaults, readObsidianVaults } from './setup.ts'

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
  const entry = new URL('../wi.ts', import.meta.url)
  const configRoot = join(home, '.config', 'wi')

  try {
    await run('node', [entry.pathname, 'setup', '--yes', '--vault', vault], {
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
