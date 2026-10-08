/**
 * `wi doctor`: checks the install and the agent setup, on request
 * (docs/adr/0070-wi-doctor-checks-on-request.md).
 *
 * It needs no stored state and writes nothing. Each check prints pass, note or fix, and a fix
 * prints the text to paste. The agent setup checks are pure functions in src/shared/doctor.ts.
 * Only an install that is broken, where a wi command cannot run, makes the exit code 1.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lstat, readdir, readFile, stat } from 'node:fs/promises'
import { platform } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

import { agentSetupChecks, isSetupNote, type CheckResult, type SetupNote, type SkillCopy } from '../../shared/doctor.ts'
import { boardSettingsIn, parsePluginData, PLUGIN_DATA_FILE } from '../../shared/board-settings.ts'
import { getList, parseFrontmatter } from '../../shared/frontmatter.ts'
import { roleTags } from '../../shared/role-tags.ts'
import { WORK_ITEM_TYPE } from '../../shared/schema.ts'
import { packageRoot, readPackageFile } from '../package-files.ts'
import { findVaultRoot, getDefaultVault, loadVault, NOT_NOTES, type Vault } from '../vault.ts'
import { MANAGED_MARKER, MANAGED_TEXT, skillDestinations } from './setup.ts'
import { validate } from './validate.ts'

const run = promisify(execFile)
const PACKAGE = 'recursive-board'
const PLUGIN_MANIFEST = '.obsidian/plugins/recursive-board/manifest.json'
const UPDATE_WI = `npm install --global ${PACKAGE}@latest`

export interface DoctorOptions {
  /** The running wi's version. */
  version: string
  vaultFlag?: string
  env: NodeJS.ProcessEnv
  cwd: string
  /** The home folder that holds the skill copies. */
  home: string
  nodeVersion: string
  /** The newest published version, or null when the registry cannot be reached. */
  latestVersion: () => Promise<string | null>
}

export interface DoctorReport {
  version: string
  vault: string | null
  /** True when a check found the install broken. */
  broken: boolean
  install: CheckResult[]
  agentSetup: CheckResult[]
}

/** Asks the npm registry for the newest version, with a short timeout. Offline gives null. */
export async function npmLatestVersion(env: NodeJS.ProcessEnv = process.env, timeoutMs = 3000): Promise<string | null> {
  const registry = (env['npm_config_registry'] || 'https://registry.npmjs.org/').replace(/\/?$/, '/')
  try {
    const response = await fetch(`${registry}${PACKAGE}/latest`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return null
    const body: unknown = await response.json()
    const version = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['version'] : undefined
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const install: CheckResult[] = []
  install.push(await nodeCheck(options.nodeVersion))
  const playbook = await readPackageFile('docs/playbook.md')
  const packagedSkill = await readPackageFile('skills/recursive-board/SKILL.md')
  install.push(packageCheck(playbook, packagedSkill))
  install.push(versionCheck(options.version, await options.latestVersion()))

  const located = await locateVault(options)
  install.push(vaultCheck(located))
  const root = located?.isVault ? located.root : null

  let vault: Vault | null = null
  if (root !== null) {
    install.push(await pluginVersionCheck(root, options.version))
    const settings = await boardSettingsCheck(root)
    install.push(settings)
    install.push(await hookCheck(root))
    if (!settings.broken) {
      vault = await loadVault(root)
      install.push(await validateCheck(vault))
    }
  }

  const skill = packagedSkill === null ? null : await skillCopies(options.home, packagedSkill)
  const agentSetup = playbook === null ? [] : agentSetupChecks({
    playbook,
    agentsMd: root === null ? null : await readIfPresent(join(root, 'AGENTS.md')),
    notes: root === null ? [] : await readNotes(root),
    openRoleTags: vault === null ? [] : openRoleTags(vault),
    maxAgents: vault?.config.maxAgents ?? null,
    skill,
  })
  // Without a vault, only the skill check means anything.
  const shown = root === null || vault === null ? agentSetup.filter((result) => result.id === 'skill') : agentSetup

  return {
    version: options.version,
    vault: root,
    broken: install.some((result) => result.broken === true),
    install,
    agentSetup: shown,
  }
}

async function nodeCheck(running: string): Promise<CheckResult> {
  const base = { id: 'node', title: 'Node meets the package engines.' }
  const text = await readPackageFile('package.json')
  const engines = text === null ? undefined : (JSON.parse(text) as { engines?: { node?: string } }).engines?.node
  const minimum = /^>=\s*(\d+(?:\.\d+){0,2})$/.exec(engines?.trim() ?? '')?.[1]
  if (minimum === undefined) return { ...base, level: 'note', message: `Node ${running}. The package names no minimum.` }
  if (compareVersions(running, minimum) >= 0) return { ...base, level: 'pass', message: `Node ${running} meets ${engines}.` }
  return { ...base, level: 'fix', broken: true, message: `Node ${running} is older than ${engines}. Install a newer Node.` }
}

function packageCheck(playbook: string | null, skill: string | null): CheckResult {
  const base = { id: 'package', title: 'The package has its playbook and skill.' }
  const missing = [playbook === null ? 'docs/playbook.md' : null, skill === null ? 'skills/recursive-board/SKILL.md' : null]
    .filter((path): path is string => path !== null)
  if (missing.length === 0) return { ...base, level: 'pass', message: `${packageRoot()} has the playbook and the skill.` }
  return {
    ...base, level: 'fix', broken: true, paste: UPDATE_WI,
    message: `${packageRoot()} has no ${missing.join(' and no ')}. Install the package again.`,
  }
}

function versionCheck(version: string, latest: string | null): CheckResult {
  const base = { id: 'wi-version', title: 'wi is the newest published version.' }
  if (latest === null) return { ...base, level: 'note', message: `wi ${version}. The npm registry did not answer, so the newest version is not known.` }
  if (compareVersions(version, latest) >= 0) return { ...base, level: 'pass', message: `wi ${version} is the newest version.` }
  return { ...base, level: 'fix', message: `wi ${version} is older than ${latest}. Update it.`, paste: UPDATE_WI }
}

interface LocatedVault {
  root: string
  source: string
  isVault: boolean
}

/** The vault wi would use, found in the same order as every other command (ADR 0059). */
async function locateVault(options: DoctorOptions): Promise<LocatedVault | null> {
  const found = (root: string, source: string): LocatedVault => ({ root, source, isVault: findVaultRoot(root) === root })
  if (options.vaultFlag !== undefined) return found(resolve(options.vaultFlag), '--vault')
  const env = options.env['WI_VAULT']
  if (env) return found(resolve(env), 'WI_VAULT')
  const folder = findVaultRoot(options.cwd)
  if (folder !== null) return found(folder, 'the current folder')
  const configured = await getDefaultVault(options.env)
  return configured ? found(resolve(configured), 'defaultVault') : null
}

function vaultCheck(located: LocatedVault | null): CheckResult {
  const base = { id: 'vault', title: 'wi finds a vault.' }
  if (located === null) {
    return {
      ...base, level: 'fix', paste: 'wi setup',
      message: 'No vault found, so the vault checks did not run. Run wi setup to choose a default vault, or pass --vault.',
    }
  }
  if (located.isVault) return { ...base, level: 'pass', message: `${located.root} (from ${located.source}).` }
  const what = existsSync(located.root) ? 'is not a vault: it has no Boards/ folder or board settings' : 'does not exist'
  return {
    ...base, level: 'fix', broken: true,
    ...(located.source === 'defaultVault' ? { paste: 'wi setup' } : {}),
    message: `${located.root} (from ${located.source}) ${what}. Each wi command that reads it fails.`,
  }
}

async function pluginVersionCheck(root: string, version: string): Promise<CheckResult> {
  const base = { id: 'plugin-version', title: 'The vault\'s plugin version matches wi.' }
  const text = await readIfPresent(join(root, ...PLUGIN_MANIFEST.split('/')))
  if (text === null) {
    return { ...base, level: 'fix', message: 'The plugin is not installed in this vault. Install Recursive Board in Obsidian: Settings > Community plugins.' }
  }
  let plugin: unknown
  try {
    plugin = (JSON.parse(text) as Record<string, unknown>)['version']
  } catch {
    plugin = undefined
  }
  if (typeof plugin !== 'string') return { ...base, level: 'note', message: `${PLUGIN_MANIFEST} names no version.` }
  if (plugin === version) return { ...base, level: 'pass', message: `The plugin and wi are both ${version}.` }
  if (compareVersions(plugin, version) < 0) {
    return { ...base, level: 'fix', message: `The plugin is ${plugin} and wi is ${version}. Update the plugin in Obsidian: Settings > Community plugins > Check for updates.` }
  }
  return { ...base, level: 'fix', message: `The plugin is ${plugin} and wi is ${version}. Update wi.`, paste: UPDATE_WI }
}

async function boardSettingsCheck(root: string): Promise<CheckResult> {
  const base = { id: 'board-settings', title: 'The plugin data holds the board settings.' }
  const sync = 'wi and the plugin use the defaults. Change a setting in Settings > Recursive Board to save them. With Obsidian Sync, turn on Installed community plugins sync on each device.'
  const text = await readIfPresent(join(root, ...PLUGIN_DATA_FILE.split('/')))
  if (text === null) return { ...base, level: 'note', message: `${PLUGIN_DATA_FILE} does not exist, so ${sync}` }
  try {
    const board = boardSettingsIn(parsePluginData(text))
    if (board === null) return { ...base, level: 'note', message: `${PLUGIN_DATA_FILE} has no board key, so ${sync}` }
    return { ...base, level: 'pass', message: `${PLUGIN_DATA_FILE} holds the board settings.` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ...base, level: 'fix', broken: true, message: `${reason} Each wi command that reads the vault fails. Close Obsidian, then repair the file.` }
  }
}

/** The vault's Git repository and its pre-commit file, found as Git finds them. Null outside Git. */
async function gitPreCommit(vault: string): Promise<{ top: string; path: string } | null> {
  const git = async (args: string[]) => (await run('git', ['-C', vault, ...args])).stdout.trim()
  try {
    return { top: await git(['rev-parse', '--show-toplevel']), path: resolve(vault, await git(['rev-parse', '--git-path', 'hooks/pre-commit'])) }
  } catch {
    return null
  }
}

/** A pre-commit file runs validation when a line that is not a comment names validate. */
function runsValidation(body: string): boolean {
  return body.split('\n').some((line) => !/^\s*#/.test(line) && /\bvalidate\b/.test(line))
}

/** The hook is advice (docs/adr/0073-git-versioning-is-advice.md), so this check only reads and is never a fix. */
async function hookCheck(root: string): Promise<CheckResult> {
  const base = { id: 'hook', title: 'The Git hook validates each commit.' }
  const advice = 'It is optional: see "Git versioning" in docs/playbook.md.'
  const git = await gitPreCommit(root)
  if (git === null) return { ...base, level: 'note', message: 'The vault is not in a Git repository, so it has no hook.' }
  const body = await readIfPresent(git.path)
  if (body === null) return { ...base, level: 'note', message: `The vault is a Git repository with no pre-commit hook. ${advice}` }
  if (!runsValidation(body)) return { ...base, level: 'note', message: `The pre-commit hook in ${git.top} does not run validation. ${advice}` }
  if (platform() !== 'win32' && ((await stat(git.path)).mode & 0o111) === 0) {
    return { ...base, level: 'note', message: `The pre-commit hook in ${git.top} is not executable, so Git skips it. Run chmod +x ${git.path}.` }
  }
  return { ...base, level: 'pass', message: `The pre-commit hook in ${git.top} runs validation.` }
}

async function validateCheck(vault: Vault): Promise<CheckResult> {
  const base = { id: 'validate', title: 'wi validate finds no errors.' }
  const report = await validate(vault)
  const counts = `${report.itemCount} work items, ${report.errorCount} errors, ${report.warningCount} warnings.`
  if (report.errorCount > 0) return { ...base, level: 'fix', message: `${counts} Run wi validate to read them.`, paste: 'wi validate' }
  if (report.warningCount > 0) return { ...base, level: 'note', message: `${counts} Run wi validate to read them.`, paste: 'wi validate' }
  return { ...base, level: 'pass', message: counts }
}

/** The state of each skill copy that wi setup installs, against the packaged SKILL.md. */
async function skillCopies(home: string, packaged: string): Promise<SkillCopy[]> {
  return Promise.all(skillDestinations(home).map(async (path): Promise<SkillCopy> => {
    let stat
    try {
      stat = await lstat(path)
    } catch {
      return { path, state: 'missing' }
    }
    if (stat.isSymbolicLink()) return { path, state: 'dev-link' }
    if (!stat.isDirectory() || await readIfPresent(join(path, MANAGED_MARKER)) !== MANAGED_TEXT) return { path, state: 'unmanaged' }
    return { path, state: await readIfPresent(join(path, 'SKILL.md')) === packaged ? 'current' : 'differs' }
  }))
}

/** Every note in the vault, with the text of each note the checks read. */
async function readNotes(root: string): Promise<SetupNote[]> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true })
  const notes = await Promise.all(entries.flatMap((entry) => {
    if (entry.isDirectory() || !/\.md$/i.test(entry.name)) return []
    const path = `${(entry.parentPath ?? root).slice(root.length + 1).split(sep).join('/')}/${entry.name}`.replace(/^\//, '')
    if (path.split('/').some((part) => NOT_NOTES.has(part))) return []
    return [readFile(join(root, ...path.split('/')), 'utf8').then((text): SetupNote => {
      const frontmatter = parseFrontmatter(text)
      const type = frontmatter?.get('type')
      const description = frontmatter?.get('description')
      const note: SetupNote = {
        path,
        ...(typeof type === 'string' ? { type } : {}),
        ...(typeof description === 'string' ? { description } : {}),
        tags: getList(text, 'tags') ?? [],
        workItem: type === WORK_ITEM_TYPE,
      }
      return isSetupNote(note) ? { ...note, text } : note
    })]
  }))
  return notes.sort((a, b) => a.path.localeCompare(b.path))
}

function openRoleTags(vault: Vault): string[] {
  return vault.items
    .filter((item) => item.status !== 'done' && !vault.isArchived(item))
    .flatMap((item) => roleTags(getList(item.text, 'tags') ?? []))
}

/** Compares two dotted version numbers. A pre-release suffix is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.replace(/^v/, '').split('-')[0]!.split('.').map((part) => Number(part) || 0)
  const left = parts(a)
  const right = parts(b)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') return null
    throw error
  }
}

/** The report as text: one line per check, and the text to paste under each fix. */
export function renderDoctor(report: DoctorReport): string {
  const out: string[] = [`wi doctor ${report.version}`, '']
  const section = (heading: string, results: CheckResult[]) => {
    out.push(heading)
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
  }
  section('Install', report.install)
  if (report.agentSetup.length > 0) section('Agent setup (optional, from docs/playbook.md in the package)', report.agentSetup)
  const all = [...report.install, ...report.agentSetup]
  const count = (level: string) => all.filter((result) => result.level === level).length
  const fixes = count('fix')
  const notes = count('note')
  out.push(`${fixes} fix${fixes === 1 ? '' : 'es'}, ${notes} note${notes === 1 ? '' : 's'}. ${report.broken ? 'The install is broken.' : 'The install works.'}`)
  return `${out.join('\n')}\n`
}
