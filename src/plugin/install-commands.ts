/**
 * setup, doctor and update on the plugin CLI
 * (docs/adr/0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md).
 *
 * wi's versions work on the machine: they copy the skill, write the wi config, run npm and check
 * Node. The plugin has no Node and writes nothing outside the vault, so its versions only print:
 * setup prints what the plugin CLI needs, the bundled skill and the playbook summary; doctor runs
 * the vault checks through the port and lists the install checks it skipped; update prints the
 * versions and where to update. None of them writes a file.
 */
import { agentSetupChecks, checkScope, countLine, installChecks, renderCheckSection, rulesCheck, type CheckResult } from '../shared/doctor.ts'
import { boardSettingsCheck, openRoleTags, readSetupNotes, validateCheck } from '../shared/doctor-vault.ts'
import { playbookBlock } from '../shared/playbook.ts'
import { RULES_VERSION, readRulesMarker, versionLine } from '../shared/rules-version.ts'
import { readIfPresent } from '../shared/storage.ts'
import type { CommandContext, CommandLine, RunFunction } from '../shared/runner.ts'
import { UsageError } from '../shared/runner.ts'
import type { Vault } from '../shared/vault.ts'
import { PLAYBOOK, SKILL } from './bundled-texts.ts'

/** The installer that prints no warning line before a reply and starts a closed Obsidian (ADR 0078). */
export const MIN_INSTALLER = '1.12.7'

/** Where an agent saves the skill, the same two folders wi setup copies it into. */
export const SKILL_PATHS = [
  '~/.claude/skills/recursive-board/SKILL.md',
  '~/.agents/skills/recursive-board/SKILL.md',
]

/** What the plugin CLI needs, one line each. */
export const CLI_NEEDS = [
  `The Obsidian installer ${MIN_INSTALLER} or later. An older one prints a warning line before every reply, and hangs when Obsidian is closed. The plugin cannot read the installer version: compare it in Settings > General.`,
  'The command line interface turned on in Settings > General > Advanced.',
  'vault=<name> as the first argument of every call: obsidian vault=<name> recursive-board cmd="<wi command line>".',
  'A reply succeeded only when its first line is exactly ok. Any other first line is a failure, and the exit code is always 0.',
]

const UPDATE_STEP = 'Update the plugin in Obsidian: Settings > Community plugins > Check for updates.'

/** The playbook of this plugin's version on GitHub. A release tag equals the version. */
function playbookUrl(version: string): string {
  return `https://github.com/vic-cio/recursive-board/blob/${version}/docs/playbook.md`
}

function takesNoWords(line: CommandLine): void {
  if (line.positionals.length > 1) throw new UsageError(`wi ${line.command} takes options only. Run cmd=help for usage.`)
}

const print = (context: CommandContext, value: unknown) => context.out(`${JSON.stringify(value, null, 2)}\n`)

/** setup: what the plugin CLI needs, where the skill goes, the playbook summary, then the skill text. */
const runSetup: RunFunction = async (context, line) => {
  takesNoWords(line)
  const summary = playbookBlock(PLAYBOOK, 'summary')
  const playbook = playbookUrl(context.version)
  if (line.values.json === true) {
    print(context, {
      plugin: context.version,
      rules: RULES_VERSION,
      needs: CLI_NEEDS,
      skill: { paths: SKILL_PATHS, text: SKILL },
      recommendedSetup: summary === null ? null : { summary, playbook, check: 'cmd=doctor' },
    })
    return 0
  }
  const out = [
    `Recursive Board ${versionLine(context.version)}, the plugin in this vault. Setup on the plugin writes nothing.`,
    '',
    'The plugin CLI needs:',
    ...CLI_NEEDS.map((need) => `- ${need}`),
    '',
    'The skill: save the text at the end of this reply as SKILL.md in the skills folder of your agent harness:',
    ...SKILL_PATHS.map((path) => `  ${path}`),
    'Run cmd=setup again after a plugin update, to read the skill of the new version.',
    '',
    ...(summary === null ? [] : [summary, '', `Playbook: ${playbook}`, 'Check a vault against it: cmd=doctor', '']),
    '--- skills/recursive-board/SKILL.md ---',
    SKILL.replace(/\n$/, ''),
    '--- end of SKILL.md ---',
  ]
  context.out(`${out.join('\n')}\n`)
  return 0
}

export interface PluginDoctorReport {
  plugin: string
  rules: number
  /** True when a vault check found the plugin data broken. */
  broken: boolean
  vault: CheckResult[]
  agentSetup: CheckResult[]
  /** The install checks wi doctor runs, which the plugin cannot. */
  skipped: { id: string; title: string }[]
  needs: string[]
}

/** The vault checks of wi doctor through the port, and the install checks it skipped. */
export async function pluginDoctor(context: CommandContext): Promise<PluginDoctorReport> {
  const rules = rulesCheck(await readRulesMarker(context.port), 'this plugin')
  const vault: CheckResult[] = [
    { ...rules, message: rules.message.replace(/(^|\. )this plugin/g, '$1This plugin') },
    await boardSettingsCheck(context.port),
  ]
  let index: Vault | null = null
  if (vault[1]!.broken !== true) {
    index = await context.vault()
    vault.push(await validateCheck(index, 'cmd=validate'))
  }
  const agentSetup = index === null ? [] : agentSetupChecks({
    playbook: PLAYBOOK,
    agentsMd: await readIfPresent(context.port, 'AGENTS.md'),
    notes: await readSetupNotes(context.port),
    openRoleTags: openRoleTags(index),
    maxAgents: index.config.maxAgents,
    skill: null,
  }).filter((result) => checkScope(result.id) === 'vault')
  return {
    plugin: context.version,
    rules: RULES_VERSION,
    broken: vault.some((result) => result.broken === true),
    vault,
    agentSetup,
    skipped: installChecks(PLAYBOOK).map(({ id, title }) => ({ id, title })),
    needs: CLI_NEEDS,
  }
}

export function renderPluginDoctor(report: PluginDoctorReport): string {
  const out = [`Recursive Board doctor ${versionLine(report.plugin)}, the plugin in this vault`, '']
  out.push(...renderCheckSection('Vault', report.vault))
  if (report.agentSetup.length > 0) out.push(...renderCheckSection('Agent setup (optional, from docs/playbook.md in the plugin)', report.agentSetup))
  out.push('Skipped install checks: run wi doctor where Node is installed')
  const width = Math.max(0, ...report.skipped.map((check) => check.id.length))
  for (const check of report.skipped) out.push(`  ${check.id.padEnd(width)}  ${check.title}`)
  out.push('', 'The plugin CLI needs:', ...report.needs.map((need) => `- ${need}`), '')
  out.push(`${countLine([...report.vault, ...report.agentSetup])} ${report.broken ? 'The plugin data is broken.' : 'The vault checks ran.'}`)
  return `${out.join('\n')}\n`
}

const runDoctor: RunFunction = async (context, line) => {
  takesNoWords(line)
  const report = await pluginDoctor(context)
  if (line.values.json === true) print(context, report)
  else context.out(renderPluginDoctor(report))
  return report.broken ? 1 : 0
}

/** update: the installed versions and where to update. The plugin cannot update itself. */
const runUpdate: RunFunction = async (context, line) => {
  takesNoWords(line)
  if (line.values.json === true) {
    print(context, { plugin: context.version, rules: RULES_VERSION, update: UPDATE_STEP })
    return 0
  }
  context.out([
    `Recursive Board ${versionLine(context.version)}, the plugin in this vault. Update on the plugin writes nothing.`,
    UPDATE_STEP,
    'Then run cmd=setup to read the skill of the new version. Where wi is installed, wi update updates it.',
  ].join('\n') + '\n')
  return 0
}

/** The install commands as the plugin serves them. wi runs its own versions. */
export const PLUGIN_RUNNERS: Readonly<Record<string, RunFunction>> = {
  setup: runSetup,
  doctor: runDoctor,
  update: runUpdate,
}
