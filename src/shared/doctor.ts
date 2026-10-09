/**
 * The checks of `wi doctor` (docs/adr/0070-wi-doctor-checks-on-request.md).
 *
 * The checks are pure: `wi doctor` and the plugin read the vault and pass what they found here, so
 * this module imports nothing from Node.
 */
import { RULES_VERSION } from './rules-version.ts'

/** A pass meets the recommendation. A note is for information. A fix carries what to change. */
export type CheckLevel = 'pass' | 'note' | 'fix'

export interface CheckResult {
  id: string
  level: CheckLevel
  /** What the check looks for. */
  title: string
  /** One line on what the check found. */
  message: string
  /** The text to paste or the command to run, when a fix has one. */
  paste?: string
  /** True when the install is broken. `wi doctor` then exits 1. */
  broken?: boolean
}

/**
 * What a check needs. A vault check reads only the vault, so the plugin runs it through the
 * storage port. An install check needs Node, the wi package or the machine, so only wi runs it.
 */
export type CheckScope = 'vault' | 'install'

export interface DoctorCheck {
  id: string
  scope: CheckScope
  /** What the check looks for. */
  title: string
}

/** The checks of `wi doctor`, in its order, each marked vault or install. */
export const DOCTOR_CHECKS: readonly DoctorCheck[] = [
  { id: 'node', scope: 'install', title: 'Node meets the package engines.' },
  { id: 'package', scope: 'install', title: 'The package has its skill.' },
  { id: 'wi-version', scope: 'install', title: 'wi is the newest published version.' },
  { id: 'vault', scope: 'install', title: 'wi finds a vault.' },
  { id: 'plugin-version', scope: 'install', title: 'The vault\'s plugin version matches wi.' },
  { id: 'rules', scope: 'vault', title: 'The plugin in this vault and wi write by the same rules.' },
  { id: 'board-settings', scope: 'vault', title: 'The plugin data holds the board settings.' },
  { id: 'hook', scope: 'install', title: 'The Git hook validates each commit.' },
  { id: 'validate', scope: 'vault', title: 'wi validate finds no errors.' },
  { id: 'skill', scope: 'install', title: 'The recursive-board skill is installed for the agent harness.' },
]

/** The id and title of a check in DOCTOR_CHECKS, for the result that reports it. */
export function checkBase(id: string): { id: string; title: string } {
  const check = DOCTOR_CHECKS.find((entry) => entry.id === id)
  if (!check) throw new Error(`no doctor check has the id ${id}.`)
  return { id, title: check.title }
}

/** The install checks, in the order of `wi doctor`. The plugin cannot run them. */
export function installChecks(): DoctorCheck[] {
  return DOCTOR_CHECKS.filter((check) => check.scope === 'install')
}

/** One section of a doctor report: a heading, one line per check, and the command to run under each fix. */
export function renderCheckSection(heading: string, results: readonly CheckResult[]): string[] {
  const out = [heading]
  const width = Math.max(0, ...results.map((result) => result.id.length))
  for (const result of results) {
    out.push(`  ${result.level.padEnd(4)}  ${result.id.padEnd(width)}  ${result.message}`)
    if (result.paste !== undefined) {
      const indent = ' '.repeat(8)
      out.push(`${indent}${result.paste.includes('\n') ? 'Paste:' : 'Run:'}`)
      for (const line of result.paste.split('\n')) out.push(line === '' ? '' : `${indent}  ${line}`)
    }
  }
  out.push('')
  return out
}

/** The closing count of a doctor report: "2 fixes, 1 note." */
export function countLine(results: readonly CheckResult[]): string {
  const count = (level: CheckLevel) => results.filter((result) => result.level === level).length
  const fixes = count('fix')
  const notes = count('note')
  return `${fixes} fix${fixes === 1 ? '' : 'es'}, ${notes} note${notes === 1 ? '' : 's'}.`
}

/** The state of one installed copy of the agent skill. */
export interface SkillCopy {
  path: string
  /**
   * `current` matches the package, `differs` is a managed copy from another version, `dev-link`
   * is a symlink to a checkout, `unmanaged` is a folder that wi setup did not install.
   */
  state: 'current' | 'differs' | 'missing' | 'dev-link' | 'unmanaged'
}

/** The skill check from the state of each copy, or a note when there is no skill to compare with. */
export function skillCheck(copies: readonly SkillCopy[] | null): CheckResult {
  const base = checkBase('skill')
  if (copies === null) {
    return { ...base, level: 'note', message: 'The package has no skill, so the skill copies were not compared. Install the package again.' }
  }
  const stale = copies.filter((copy) => copy.state === 'missing' || copy.state === 'differs')
  if (stale.length > 0) {
    const what = stale.map((copy) => `${copy.path} (${copy.state === 'missing' ? 'missing' : 'another version'})`).join(', ')
    return { ...base, level: 'fix', message: `The skill does not match this wi: ${what}. Run wi setup.`, paste: 'wi setup' }
  }
  const unmanaged = copies.filter((copy) => copy.state === 'unmanaged')
  if (unmanaged.length > 0) {
    return {
      ...base, level: 'note',
      message: `wi setup did not install ${unmanaged.map((copy) => copy.path).join(', ')}. Compare it with the package, or run wi setup --force to replace it.`,
    }
  }
  const links = copies.filter((copy) => copy.state === 'dev-link').length
  return { ...base, level: 'pass', message: links > 0 ? 'The skill is installed; a development link is kept.' : 'Both skill copies match this wi.' }
}

/**
 * The rules check: the marker in the plugin data against the rules this writer carries
 * (docs/adr/0079-the-rules-version-marker-lives-in-the-plugin-data.md). `writer` names the writer
 * in the message, such as `wi`.
 */
export function rulesCheck(marker: number | null, writer: string, rules: number = RULES_VERSION): CheckResult {
  const base = { id: 'rules', title: `The plugin in this vault and ${writer} write by the same rules.` }
  if (marker === null) {
    return { ...base, level: 'note', message: `The plugin data has no rules version, so a newer plugin is not known. ${writer} has rules version ${rules}.` }
  }
  if (marker === rules) return { ...base, level: 'pass', message: `The vault and ${writer} both have rules version ${rules}.` }
  if (marker > rules) {
    return { ...base, level: 'fix', message: `A plugin with rules version ${marker} works on this vault, and ${writer} has rules version ${rules}. Each write warns. Update ${writer}.` }
  }
  return { ...base, level: 'fix', message: `The plugin has rules version ${marker}, and ${writer} has rules version ${rules}. Update the plugin in Obsidian: Settings > Community plugins > Check for updates.` }
}
