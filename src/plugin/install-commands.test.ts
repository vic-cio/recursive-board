import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DOCTOR_CHECKS } from '../shared/doctor.ts'
import { PLUGIN_DATA_FILE } from '../shared/board-settings.ts'
import { FOLDERS } from '../shared/schema.ts'
import type { VaultSeams } from '../shared/vault.ts'
import { SKILL } from './bundled-texts.ts'
import { handleCli } from './cli-handler.ts'
import { fakeObsidian, type FakeObsidian } from './fake-obsidian.ts'
import { CLI_NEEDS, MIN_INSTALLER, SKILL_PATHS } from './install-commands.ts'
import { obsidianPort } from './obsidian-port.ts'

const card = (fields: Record<string, string>, body = '') =>
  `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\n\n${body}`

/** A vault with no AGENTS.md and no Roles folder, and plugin data with the board settings and the marker. */
const FILES: Record<string, string> = {
  'Boards/Main.md': card({ type: 'work-item', id: 'wi-0001', title: 'Main', board: 'true', created: '2026-09-01', updated: '2026-09-01' }),
  'Boards/Build.md': card({
    type: 'work-item', id: 'wi-0002', title: 'Build', status: 'doing', parent: '"[[Main]]"', assignee: 'bot', tags: '[role/coder]',
    created: '2026-09-01', updated: '2026-09-01',
  }, '## Objective\n\nBuild it.\n\n## Acceptance Criteria\n\n- Built\n'),
  [PLUGIN_DATA_FILE]: JSON.stringify({ board: { maxAgents: 2 }, rulesVersion: 1 }),
}

function seams(): VaultSeams {
  return { now: () => new Date(2026, 9, 9, 10, 30), random: () => 0.5 }
}

async function call(cmd: string, app: FakeObsidian = fakeObsidian(FILES, FOLDERS)): Promise<{ reply: string; app: FakeObsidian }> {
  return { reply: await handleCli({ cmd }, { port: obsidianPort(app), version: '1.2.3', seams: seams() }), app }
}

test('doctor lists the vault checks with results, then the skipped install checks under their heading', async () => {
  const { reply, app } = await call('doctor')
  const lines = reply.split('\n')
  assert.equal(lines[0], 'ok')
  assert.equal(lines[1], 'Recursive Board doctor 1.2.3 (rules 1), the plugin in this vault')
  const vault = lines.indexOf('Vault')
  assert.match(lines[vault + 1]!, /^ {2}pass {2}rules {11}The vault and this plugin both have rules version 1\.$/)
  assert.match(lines[vault + 2]!, /^ {2}pass {2}board-settings {2}\.obsidian\/plugins\/recursive-board\/data\.json holds the board settings\.$/)
  assert.match(lines[vault + 3]!, /^ {2}pass {2}validate {8}2 work items, 0 errors, 0 warnings\.$/)

  const skipped = lines.indexOf('Skipped install checks: run wi doctor where Node is installed')
  assert.ok(vault < skipped)
  assert.doesNotMatch(reply, /Agent setup|playbook/i)

  const ids = lines.slice(skipped + 1, lines.indexOf('', skipped)).map((line) => line.trim().split(/\s+/)[0])
  assert.deepEqual(ids, DOCTOR_CHECKS.filter((check) => check.scope === 'install').map((check) => check.id))
  assert.match(reply, new RegExp(`The Obsidian installer ${MIN_INSTALLER.replace(/\./g, '\\.')} or later`))
  assert.match(lines.at(-2)!, /^0 fixes, 0 notes\. The vault checks ran\.$/)
  assert.deepEqual(app.files, new Map(Object.entries(FILES)), 'doctor writes nothing')
})

test('doctor --json gives the same checks, marked by section', async () => {
  const { reply } = await call('doctor --json')
  const report = JSON.parse(reply.slice('ok\n'.length)) as { vault: { id: string }[]; skipped: { id: string }[]; needs: string[]; broken: boolean }
  assert.deepEqual(report.vault.map((check) => check.id), ['rules', 'board-settings', 'validate'])
  assert.ok(report.skipped.some((check) => check.id === 'node'))
  assert.deepEqual(report.needs, CLI_NEEDS)
  assert.equal(report.broken, false)
})

test('doctor: plugin data that cannot be read is broken, so the reply is an error line', async () => {
  const { reply } = await call('doctor', fakeObsidian({ ...FILES, [PLUGIN_DATA_FILE]: '{ nope' }, FOLDERS))
  const lines = reply.split('\n')
  assert.equal(lines[0], 'error: wi doctor exited 1')
  assert.match(reply, /^ {2}fix {3}board-settings {2}/m)
  assert.doesNotMatch(reply, /validate {2}/)
  assert.match(reply, /The plugin data is broken\.\n$/)
})

test('doctor: a newer rules marker says to update this plugin', async () => {
  const { reply } = await call('doctor', fakeObsidian({ ...FILES, [PLUGIN_DATA_FILE]: JSON.stringify({ rulesVersion: 9 }) }, FOLDERS))
  assert.match(reply, /^ {2}fix {3}rules +A plugin with rules version 9 works on this vault, and this plugin has rules version 1\. Each write warns\. Update this plugin\.$/m)
})

test('setup prints what the plugin CLI needs, where the skill goes, and the bundled skill', async () => {
  const { reply, app } = await call('setup')
  assert.equal(reply.split('\n')[0], 'ok')
  for (const need of CLI_NEEDS) assert.ok(reply.includes(`- ${need}\n`), need)
  for (const path of SKILL_PATHS) assert.ok(reply.includes(`  ${path}\n`), path)
  assert.doesNotMatch(reply.slice(0, reply.indexOf('--- skills/')), /playbook/i)
  assert.ok(reply.endsWith(`--- skills/recursive-board/SKILL.md ---\n${SKILL}--- end of SKILL.md ---\n`))
  assert.deepEqual(app.files, new Map(Object.entries(FILES)), 'setup writes nothing')
})

test('setup --json carries the skill text and its paths', async () => {
  const { reply } = await call('setup --json')
  const result = JSON.parse(reply.slice('ok\n'.length)) as { skill: { paths: string[]; text: string } }
  assert.equal(result.skill.text, SKILL)
  assert.deepEqual(result.skill.paths, SKILL_PATHS)
  assert.equal('recommendedSetup' in result, false)
})

test('update prints the plugin and rules versions and where to update, and writes nothing', async () => {
  const { reply, app } = await call('update')
  assert.equal(reply, [
    'ok',
    'Recursive Board 1.2.3 (rules 1), the plugin in this vault. Update on the plugin writes nothing.',
    'Update the plugin in Obsidian: Settings > Community plugins > Check for updates.',
    'Then run cmd=setup to read the skill of the new version. Where wi is installed, wi update updates it.',
    '',
  ].join('\n'))
  assert.deepEqual(app.files, new Map(Object.entries(FILES)))
  const json = JSON.parse((await call('update --json')).reply.slice('ok\n'.length)) as Record<string, unknown>
  assert.deepEqual(json, { plugin: '1.2.3', rules: 1, update: 'Update the plugin in Obsidian: Settings > Community plugins > Check for updates.' })
})

test('a newer rules marker gives the install commands no write warning, since they write nothing', async () => {
  const app = fakeObsidian({ ...FILES, [PLUGIN_DATA_FILE]: JSON.stringify({ rulesVersion: 9 }) }, FOLDERS)
  for (const cmd of ['setup', 'update']) assert.doesNotMatch((await call(cmd, app)).reply, /wi: warning/, cmd)
})

test('doctor: a missing rules marker is a note, and a vault error names cmd=validate', async () => {
  const files = { 'Boards/Main.md': card({ type: 'work-item', id: 'wi-0001', title: 'Main', board: 'true' }) }
  const { reply } = await call('doctor', fakeObsidian(files, FOLDERS))
  assert.match(reply, /^ {2}note {2}rules +The plugin data has no rules version, so a newer plugin is not known\. This plugin has rules version 1\.$/m)
  assert.match(reply, /^ {2}fix {3}validate +1 work items, \d+ errors, 0 warnings\. Run cmd=validate to read them\.\n {8}Run:\n {10}cmd=validate$/m)
})
