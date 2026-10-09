import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { item, makeVault, type Fixture } from '../test-helpers.ts'
import { compareVersions, npmLatestVersion, renderDoctor, runDoctor, type DoctorOptions, type DoctorReport } from './doctor.ts'
import { MANAGED_MARKER, MANAGED_TEXT, skillDestinations } from './setup.ts'
import { PLUGIN_DATA_FILE } from '../../shared/board-settings.ts'
import { RULES_VERSION } from '../../shared/rules-version.ts'

const run = promisify(execFile)
const ENTRY = fileURLToPath(new URL('../wi.ts', import.meta.url))
const PACKAGED_SKILL = readFileSync(new URL('../../../skills/recursive-board/SKILL.md', import.meta.url), 'utf8')
const VERSION = (JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }).version
const PLUGIN_MANIFEST = '.obsidian/plugins/recursive-board/manifest.json'

interface Setup {
  vault: Fixture
  home: string
  options(extra?: Partial<DoctorOptions>): DoctorOptions
  cleanup(): void
}

/** A temp vault and a temp home. No check looks at ~/Vaults or the real home. */
function setup(): Setup {
  const vault = makeVault()
  const home = mkdtempSync(join(tmpdir(), 'wi-doctor-home-'))
  return {
    vault,
    home,
    options: (extra = {}) => ({
      version: VERSION,
      vaultFlag: vault.root,
      env: { XDG_CONFIG_HOME: join(home, '.config') },
      cwd: home,
      home,
      nodeVersion: '26.0.0',
      latestVersion: async () => VERSION,
      ...extra,
    }),
    cleanup() {
      vault.cleanup()
      rmSync(home, { recursive: true, force: true })
    },
  }
}

/** A bare vault: no AGENTS.md and no Roles folder. Both skill copies are installed. */
function healthy(s: Setup): void {
  s.vault.write(PLUGIN_DATA_FILE, JSON.stringify({ board: { maxAgents: 2 }, rulesVersion: RULES_VERSION }))
  s.vault.write(PLUGIN_MANIFEST, JSON.stringify({ id: 'recursive-board', version: VERSION }))
  s.vault.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-09-21', updated: '2026-09-21' }))
  s.vault.write('Boards/Task.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Task', status: 'options', parent: '"[[Main]]"', tags: '[role/coder]',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  for (const folder of skillDestinations(s.home)) installSkill(folder, PACKAGED_SKILL)
}

function installSkill(folder: string, skill: string): void {
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'SKILL.md'), skill)
  writeFileSync(join(folder, MANAGED_MARKER), MANAGED_TEXT)
}

function result(report: DoctorReport, id: string) {
  const found = report.install.find((r) => r.id === id)
  assert.ok(found, `a ${id} result`)
  return found
}

/** Every file under a folder, with its bytes and its modification time. */
function snapshot(root: string): Map<string, string> {
  const files = new Map<string, string>()
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name)
    const stat = statSync(path, { throwIfNoEntry: false })
    files.set(path, entry.isFile() ? `${stat?.mtimeMs} ${readFileSync(path, 'utf8')}` : 'folder')
  }
  return files
}

test('a vault with no AGENTS.md and no Roles folder passes every check, and doctor writes nothing', async () => {
  const s = setup()
  try {
    healthy(s)
    const before = [snapshot(s.vault.root), snapshot(s.home)]
    const report = await runDoctor(s.options())
    assert.deepEqual([snapshot(s.vault.root), snapshot(s.home)], before)

    assert.equal(report.broken, false)
    assert.equal(report.vault, s.vault.root)
    assert.deepEqual(report.install.map((r) => r.id),
      ['node', 'package', 'wi-version', 'vault', 'plugin-version', 'rules', 'board-settings', 'hook', 'validate', 'skill'])
    for (const r of report.install.filter((r) => r.id !== 'hook')) assert.equal(r.level, 'pass', `${r.id}: ${r.message}`)
    assert.equal(result(report, 'hook').level, 'note')
  } finally {
    s.cleanup()
  }
})

test('node: a Node older than the package engines breaks the install', async () => {
  const s = setup()
  try {
    healthy(s)
    const report = await runDoctor(s.options({ nodeVersion: '18.19.0' }))
    assert.equal(result(report, 'node').level, 'fix')
    assert.equal(report.broken, true)
  } finally {
    s.cleanup()
  }
})

test('wi-version: offline is a note, an older wi is a fix with the update command', async () => {
  const s = setup()
  try {
    healthy(s)
    const offline = await runDoctor(s.options({ latestVersion: async () => null }))
    assert.equal(result(offline, 'wi-version').level, 'note')
    assert.equal(offline.broken, false)

    const old = await runDoctor(s.options({ latestVersion: async () => '99.0.0' }))
    assert.equal(result(old, 'wi-version').level, 'fix')
    assert.match(result(old, 'wi-version').paste ?? '', /npm install --global recursive-board@latest/)
    assert.equal(old.broken, false)
  } finally {
    s.cleanup()
  }
})

test('npmLatestVersion reads the registry, and gives null when the registry does not answer', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/recursive-board/latest') response.end(JSON.stringify({ version: '9.9.9' }))
    else response.writeHead(404).end()
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  try {
    const address = server.address()
    assert.ok(address !== null && typeof address === 'object')
    assert.equal(await npmLatestVersion({ npm_config_registry: `http://127.0.0.1:${address.port}` }), '9.9.9')
  } finally {
    await new Promise((done) => server.close(done))
  }
  // A closed loopback port refuses at once: the offline case, with no network.
  assert.equal(await npmLatestVersion({ npm_config_registry: 'http://127.0.0.1:9/' }, 500), null)
})

test('vault: no vault found is a fix that is not broken; a named vault that does not exist is broken', async () => {
  const s = setup()
  try {
    healthy(s)
    const { vaultFlag: _, ...noFlag } = s.options()
    const none = await runDoctor(noFlag)
    assert.equal(result(none, 'vault').level, 'fix')
    assert.equal(none.broken, false)
    assert.equal(none.vault, null)
    assert.equal(none.install.some((r) => r.id === 'validate'), false)

    const missing = await runDoctor(s.options({ vaultFlag: join(s.home, 'no-such-vault') }))
    assert.equal(result(missing, 'vault').level, 'fix')
    assert.match(result(missing, 'vault').message, /does not exist/)
    assert.equal(missing.broken, true)
  } finally {
    s.cleanup()
  }
})

test('vault: the defaultVault from wi setup is found when no flag, WI_VAULT or folder names one', async () => {
  const s = setup()
  try {
    healthy(s)
    mkdirSync(join(s.home, '.config', 'wi'), { recursive: true })
    writeFileSync(join(s.home, '.config', 'wi', 'config.json'), JSON.stringify({ defaultVault: s.vault.root }))
    const { vaultFlag: _, ...noFlag } = s.options()
    const report = await runDoctor(noFlag)
    assert.equal(report.vault, s.vault.root)
    assert.match(result(report, 'vault').message, /defaultVault/)
  } finally {
    s.cleanup()
  }
})

test('rules: wi doctor reports a newer, an older and a missing rules version marker', async () => {
  const s = setup()
  try {
    healthy(s)
    const rules = async () => result(await runDoctor(s.options()), 'rules')
    s.vault.write(PLUGIN_DATA_FILE, JSON.stringify({ board: { maxAgents: 2 }, rulesVersion: RULES_VERSION + 1 }))
    const newer = await rules()
    assert.equal(newer.level, 'fix')
    assert.match(newer.message, /Update wi/)

    s.vault.write(PLUGIN_DATA_FILE, JSON.stringify({ board: { maxAgents: 2 }, rulesVersion: 0.5 }))
    assert.equal((await rules()).level, 'note')

    s.vault.write(PLUGIN_DATA_FILE, JSON.stringify({ board: { maxAgents: 2 } }))
    assert.equal((await rules()).level, 'note')

    s.vault.write(PLUGIN_DATA_FILE, '{broken')
    assert.equal((await rules()).level, 'note')
  } finally {
    s.cleanup()
  }
})

test('plugin-version: a missing plugin, an older plugin and an older wi are fixes', async () => {
  const s = setup()
  try {
    healthy(s)
    rmSync(join(s.vault.root, PLUGIN_MANIFEST))
    assert.match(result(await runDoctor(s.options()), 'plugin-version').message, /not installed/)

    s.vault.write(PLUGIN_MANIFEST, JSON.stringify({ version: '0.8.1' }))
    const older = result(await runDoctor(s.options()), 'plugin-version')
    assert.equal(older.level, 'fix')
    assert.match(older.message, /Update the plugin/)

    s.vault.write(PLUGIN_MANIFEST, JSON.stringify({ version: '99.0.0' }))
    const newer = result(await runDoctor(s.options()), 'plugin-version')
    assert.equal(newer.level, 'fix')
    assert.match(newer.message, /Update wi/)
  } finally {
    s.cleanup()
  }
})

test('board-settings: no data file is a note with the Sync caveat; a data file that cannot be read is broken', async () => {
  const s = setup()
  try {
    healthy(s)
    rmSync(join(s.vault.root, '.obsidian', 'plugins', 'recursive-board', 'data.json'))
    const absent = await runDoctor(s.options())
    assert.equal(result(absent, 'board-settings').level, 'note')
    assert.match(result(absent, 'board-settings').message, /Obsidian Sync/)
    assert.equal(absent.broken, false)

    s.vault.write('.obsidian/plugins/recursive-board/data.json', '{"board": ')
    const bad = await runDoctor(s.options())
    assert.equal(result(bad, 'board-settings').level, 'fix')
    assert.equal(bad.broken, true)
    assert.equal(bad.install.some((r) => r.id === 'validate'), false)
  } finally {
    s.cleanup()
  }
})

test('hook: it reads the pre-commit file and never writes one', async () => {
  const s = setup()
  try {
    healthy(s)
    assert.match(result(await runDoctor(s.options()), 'hook').message, /not in a Git repository/)

    await run('git', ['init', '--quiet', s.vault.root])
    const hook = join(s.vault.root, '.git', 'hooks', 'pre-commit')
    const without = result(await runDoctor(s.options()), 'hook')
    assert.equal(without.level, 'note')
    assert.equal(without.paste, undefined, 'a hook is advice, so the check pastes nothing')
    assert.match(without.message, /optional/)
    assert.doesNotMatch(without.message, /playbook/)
    assert.throws(() => statSync(hook), 'doctor wrote no hook')

    // A hook that an older wi hook install wrote runs validation.
    writeFileSync(hook, `#!/bin/sh\n# installed by scripts/vault-git.mjs\nexec '/bin/node' '${ENTRY}' validate --vault '${s.vault.root}'\n`)
    chmodSync(hook, 0o755)
    assert.equal(result(await runDoctor(s.options()), 'hook').level, 'pass')

    // A hook that does not validate is a note, not a fix.
    writeFileSync(hook, '#!/bin/sh\n# validate the vault later\nexit 0\n')
    const other = result(await runDoctor(s.options()), 'hook')
    assert.equal(other.level, 'note')
    assert.match(other.message, /does not run validation/)

    // A hook that Git cannot run does nothing.
    writeFileSync(hook, '#!/bin/sh\nexec wi validate\n')
    chmodSync(hook, 0o644)
    const inert = result(await runDoctor(s.options()), 'hook')
    assert.equal(inert.level, 'note')
    assert.match(inert.message, /not executable/)
  } finally {
    s.cleanup()
  }
})

test('validate: an error in the vault is a fix that prints wi validate, and the install still works', async () => {
  const s = setup()
  try {
    healthy(s)
    s.vault.write('Boards/Orphan.md', item({
      type: 'work-item', id: 'wi-0003', title: 'Orphan', status: 'options', parent: '"[[Nowhere]]"', created: '2026-09-21', updated: '2026-09-21',
    }))
    const report = await runDoctor(s.options())
    assert.equal(result(report, 'validate').level, 'fix')
    assert.match(result(report, 'validate').message, /1 errors/)
    assert.equal(result(report, 'validate').paste, 'wi validate')
    assert.equal(report.broken, false)
  } finally {
    s.cleanup()
  }
})

test('skill: missing, other-version, unmanaged and dev-link copies', async () => {
  const s = setup()
  try {
    healthy(s)
    const [claude, agents] = skillDestinations(s.home) as [string, string]
    rmSync(agents, { recursive: true })
    const missing = result(await runDoctor(s.options()), 'skill')
    assert.equal(missing.level, 'fix')
    assert.equal(missing.paste, 'wi setup')

    installSkill(agents, 'an older skill\n')
    assert.match(result(await runDoctor(s.options()), 'skill').message, /another version/)

    rmSync(join(agents, MANAGED_MARKER))
    assert.equal(result(await runDoctor(s.options()), 'skill').level, 'note')

    rmSync(agents, { recursive: true })
    symlinkSync(claude, agents)
    assert.equal(result(await runDoctor(s.options()), 'skill').level, 'pass')
  } finally {
    s.cleanup()
  }
})

test('renderDoctor prints one line per check and a Run line for a command', async () => {
  const s = setup()
  try {
    healthy(s)
    const text = renderDoctor(await runDoctor(s.options({ latestVersion: async () => '1.0.0' })))
    assert.match(text, /^Install$/m)
    assert.doesNotMatch(text, /Agent setup|docs\/playbook/i)
    assert.match(text, /^ {2}fix {3}wi-version/m)
    assert.match(text, /^ {8}Run:\n {10}npm install --global recursive-board@latest$/m)
    assert.match(text, /^1 fix, 1 note\. The install works\.$/m)
  } finally {
    s.cleanup()
  }
})

test('wi doctor --json exits 0 for a working install and 1 for a broken one, and never asks the real registry', async () => {
  const s = setup()
  const env = {
    ...process.env, HOME: s.home, XDG_CONFIG_HOME: join(s.home, '.config'),
    npm_config_registry: 'http://127.0.0.1:9/', WI_VAULT: '',
  }
  try {
    healthy(s)
    const ok = await run('node', [ENTRY, 'doctor', '--json', '--vault', s.vault.root], { env, cwd: s.home })
    const report = JSON.parse(ok.stdout) as DoctorReport
    assert.equal(report.broken, false)
    assert.equal(report.install.find((r) => r.id === 'wi-version')?.level, 'note')

    await assert.rejects(run('node', [ENTRY, 'doctor', '--vault', join(s.home, 'gone')], { env, cwd: s.home }),
      (error: { code?: number; stdout?: string }) => error.code === 1 && /The install is broken\./.test(error.stdout ?? ''))
  } finally {
    s.cleanup()
  }
})

test('compareVersions orders dotted versions and ignores a pre-release suffix', () => {
  assert.ok(compareVersions('0.8.10', '0.8.9') > 0)
  assert.ok(compareVersions('20.11.1', '20.12') < 0)
  assert.equal(compareVersions('v1.2.0-beta.1', '1.2'), 0)
})
