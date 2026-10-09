/**
 * The agent setup checks of `wi doctor` (docs/adr/0070-wi-doctor-checks-on-request.md).
 *
 * Each check compares the vault with one recommendation in the playbook's `checks` block, and a
 * fix carries the text to paste, taken from the playbook's marked blocks. The checks are pure:
 * `wi doctor` reads the vault and passes what it found here. They read the same playbook text as
 * the plugin, so this module imports nothing from Node.
 */
import { playbookBlock, playbookChecks } from './playbook.ts'
import { procedureNotes, roleTagKey, roleTags } from './role-tags.ts'
import { PERSON_TYPE } from './authorship.ts'
import { RULES_VERSION } from './rules-version.ts'

/** A pass meets the recommendation. A note is for information. A fix carries what to change. */
export type CheckLevel = 'pass' | 'note' | 'fix'

export interface CheckResult {
  id: string
  level: CheckLevel
  /** What the check looks for: the playbook's line, or the install check's name. */
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

/**
 * The checks of the Install section of `wi doctor`, in its order, each marked vault or install.
 * The agent setup checks come from the playbook's `checks` block; `checkScope` marks those.
 */
export const DOCTOR_CHECKS: readonly DoctorCheck[] = [
  { id: 'node', scope: 'install', title: 'Node meets the package engines.' },
  { id: 'package', scope: 'install', title: 'The package has its playbook and skill.' },
  { id: 'wi-version', scope: 'install', title: 'wi is the newest published version.' },
  { id: 'vault', scope: 'install', title: 'wi finds a vault.' },
  { id: 'plugin-version', scope: 'install', title: 'The vault\'s plugin version matches wi.' },
  { id: 'rules', scope: 'vault', title: 'The plugin in this vault and wi write by the same rules.' },
  { id: 'board-settings', scope: 'vault', title: 'The plugin data holds the board settings.' },
  { id: 'hook', scope: 'install', title: 'The Git hook validates each commit.' },
  { id: 'validate', scope: 'vault', title: 'wi validate finds no errors.' },
]

/** The agent setup checks that read the machine, not the vault. */
const INSTALL_SETUP_CHECKS = new Set(['skill'])

/** Whether a check of wi doctor or of the playbook's `checks` block reads only the vault. */
export function checkScope(id: string): CheckScope {
  const listed = DOCTOR_CHECKS.find((check) => check.id === id)
  if (listed) return listed.scope
  return INSTALL_SETUP_CHECKS.has(id) ? 'install' : 'vault'
}

/** The id and title of a check in DOCTOR_CHECKS, for the result that reports it. */
export function checkBase(id: string): { id: string; title: string } {
  const check = DOCTOR_CHECKS.find((entry) => entry.id === id)
  if (!check) throw new Error(`no doctor check has the id ${id}.`)
  return { id, title: check.title }
}

/** Every install check, the Install section's first and then the playbook's, in their order. */
export function installChecks(playbook: string): DoctorCheck[] {
  return [
    ...DOCTOR_CHECKS.filter((check) => check.scope === 'install'),
    ...playbookChecks(playbook).filter((check) => checkScope(check.id) === 'install')
      .map(({ id, text }): DoctorCheck => ({ id, scope: 'install', title: text })),
  ]
}

/** One section of a doctor report: a heading, one line per check, and the text to paste under each fix. */
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

/** A note in the vault, as the checks see it. */
export interface SetupNote {
  /** Vault-relative, with forward slashes. */
  path: string
  type?: string
  description?: string
  tags: readonly string[]
  workItem: boolean
  /** The whole text. A writer gives it for each note that isSetupNote picks. */
  text?: string
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

export interface AgentSetupInput {
  playbook: string
  /** The text of AGENTS.md at the vault root, or null when it is missing. */
  agentsMd: string | null
  notes: readonly SetupNote[]
  /** The role tags on cards that are not done and not archived. */
  openRoleTags: readonly string[]
  maxAgents: number | null
  /** The skill copies, or null when the package has no skill to compare them with. */
  skill: readonly SkillCopy[] | null
}

const DISPATCHING_NOTE = 'Roles/Dispatching.md'

/** The notes whose text the checks read: role notes and the procedure notes. */
export function isSetupNote(note: SetupNote): boolean {
  if (note.workItem) return false
  return roleTags(note.tags).length > 0 || note.type === 'procedure' || isDispatchingName(note.path)
}

function isDispatchingName(path: string): boolean {
  return /(?:^|\/)dispatching\.md$/i.test(path)
}

function isDispatchingNote(note: SetupNote): boolean {
  if (note.workItem) return false
  return isDispatchingName(note.path) || (note.type === 'procedure' && /^dispatching\b/i.test(note.description ?? ''))
}

type Check = (input: AgentSetupInput, title: string) => CheckResult

const CHECKS: Record<string, Check> = {
  'agents-md': (input, title) => {
    const id = 'agents-md'
    if (input.agentsMd !== null && /^#{1,6}\s+Agents and roles\s*$/im.test(input.agentsMd)) {
      return { id, level: 'pass', title, message: 'AGENTS.md has an Agents and roles section.' }
    }
    const message = input.agentsMd === null
      ? 'The vault root has no AGENTS.md. Make one, and paste this section into it.'
      : 'AGENTS.md has no Agents and roles section. Paste this section into it.'
    return withPaste({ id, level: 'fix', title, message }, playbookBlock(input.playbook, 'agents-and-roles'))
  },

  'dispatching-note': (input, title) => {
    const id = 'dispatching-note'
    const found = input.notes.find(isDispatchingNote)
    if (found) return { id, level: 'pass', title, message: `The Dispatching procedure is ${found.path}.` }
    return withPaste({
      id, level: 'fix', title,
      message: `No Dispatching procedure note. Save this text as ${DISPATCHING_NOTE}.`,
    }, playbookBlock(input.playbook, 'dispatching'))
  },

  'role-notes': (input, title) => {
    const id = 'role-notes'
    const missing = new Map<string, string>()
    for (const tag of roleTags(input.openRoleTags)) {
      if (procedureNotes(tag, input.notes).length === 0 && !missing.has(roleTagKey(tag))) missing.set(roleTagKey(tag), tag)
    }
    if (missing.size === 0) {
      const count = new Set(input.openRoleTags.map(roleTagKey)).size
      return { id, level: 'pass', title, message: count === 0 ? 'No open card has a role tag.' : `Each of ${count} role tags on open cards has a note.` }
    }
    const tags = [...missing.values()].join(', ')
    return withPaste({
      id, level: 'fix', title,
      message: `No note carries ${tags}. Write a role note for each tag, like this example.`,
    }, playbookBlock(input.playbook, 'role-note'))
  },

  'person-note': (input, title) => {
    const id = 'person-note'
    const count = input.notes.filter((note) => note.type === PERSON_TYPE).length
    if (count > 0) return { id, level: 'pass', title, message: `${count} person note${count === 1 ? '' : 's'}.` }
    return {
      id, level: 'fix', title,
      message: 'No note has type: person. Save this text as People/<name>.md for each reviewer.',
      paste: `---\ntype: ${PERSON_TYPE}\n---\n`,
    }
  },

  'max-agents': (input, title) => {
    const id = 'max-agents'
    if (input.maxAgents !== null) return { id, level: 'pass', title, message: `maxAgents is ${input.maxAgents}.` }
    return {
      id, level: 'fix', title,
      message: 'maxAgents is not set. Set it in Settings > Recursive Board > Dispatcher > Concurrent agent limit.',
    }
  },

  skill: (input, title) => ({ ...skillCheck(input.skill), title }),

  'background-wait': (input, title) => {
    const id = 'background-wait'
    const stale = input.notes.filter((note) => isSetupNote(note) && waitsInBackground(note.text ?? '')).map((note) => note.path).sort()
    if (stale.length === 0) return { id, level: 'pass', title, message: 'No role or procedure note waits in a background task.' }
    return withPaste({
      id, level: 'fix', title,
      message: `${stale.join(', ')} ${stale.length === 1 ? 'tells' : 'tell'} a worker to wait in a background task. A headless worker then ends early. Replace that step with this one.`,
    }, procedureStep(playbookBlock(input.playbook, 'dispatching'), 7))
  },

  'agent-count': (input, title) => {
    const id = 'agent-count'
    const stale = input.notes.filter((note) => isSetupNote(note) && /\bwi dashboard\b/.test(note.text ?? '')).map((note) => note.path).sort()
    if (stale.length === 0) return { id, level: 'pass', title, message: 'No role or procedure note reads the agent limit from wi dashboard.' }
    return withPaste({
      id, level: 'fix', title,
      message: `${stale.join(', ')} ${stale.length === 1 ? 'runs' : 'run'} wi dashboard, which is retired. Replace that step with this one.`,
    }, procedureStep(playbookBlock(input.playbook, 'dispatching'), 3))
  },
}

/** The agent setup results, one per check id in the playbook's `checks` block, in its order. */
export function agentSetupChecks(input: AgentSetupInput): CheckResult[] {
  return playbookChecks(input.playbook).map(({ id, text }) => {
    const check = CHECKS[id]
    if (check) return check(input, text)
    return { id, level: 'note', title: text, message: 'This version of wi does not know this check. Update wi.' }
  })
}

/** The skill check from the state of each copy, or a note when there is no skill to compare with. */
export function skillCheck(copies: readonly SkillCopy[] | null): CheckResult {
  const base = { id: 'skill', title: 'The recursive-board skill is installed for the agent harness.' }
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
  if (marker === rules) return { ...base, level: 'pass', message: `The plugin and ${writer} both have rules version ${rules}.` }
  if (marker > rules) {
    return { ...base, level: 'fix', message: `A plugin with rules version ${marker} works on this vault, and ${writer} has rules version ${rules}. Each write warns. Update ${writer}.` }
  }
  return { ...base, level: 'fix', message: `The plugin has rules version ${marker}, and ${writer} has rules version ${rules}. Update the plugin in Obsidian: Settings > Community plugins > Check for updates.` }
}

/**
 * True when a line tells a worker to wait in a background task: the old step that ends a headless
 * worker before its children finish. A line that says "never" or "foreground" is the new step.
 */
function waitsInBackground(text: string): boolean {
  return text.split('\n').some((line) =>
    /\bwait/i.test(line) && /\bbackground\b/i.test(line) && !/\b(never|foreground)\b/i.test(line))
}

/** One numbered step of a procedure block, with its indented lines. */
function procedureStep(block: string | null, step: number): string | null {
  if (block === null) return null
  const lines = block.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`${step}. `))
  if (start === -1) return null
  let end = start + 1
  while (end < lines.length && /^\s+\S/.test(lines[end]!)) end++
  return lines.slice(start, end).join('\n')
}

function withPaste(result: CheckResult, paste: string | null): CheckResult {
  return paste === null ? result : { ...result, paste }
}
