/**
 * `wi update`: install the newest package, then refresh the skill copies and the vault's plugin
 * from it, and print what changed for agents.
 *
 * docs/adr/0071-wi-update.md: the running `wi` is the old code. After step 1 installs the new
 * package, it runs the new `wi update --from <old version>`, so steps 2 to 4 use the new package's
 * files and the new code's rules. Every outside effect goes through `UpdateSeams`, so the tests
 * run on temp folders and never call npm.
 */
import { spawn } from 'node:child_process'
import { copyFile, lstat, readdir, readFile, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { agentSetupSince, compareVersions, type ChangelogSection } from '../../shared/changelog.ts'
import { findVaultRoot, getDefaultVault } from '../vault.ts'
import { installSkillCopy, MANAGED_MARKER, MANAGED_TEXT, skillDestinations } from './setup.ts'

export const PACKAGE_NAME = 'recursive-board'
const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css'] as const

export interface Npm {
  /** The version that the `latest` tag names on the registry. */
  latestVersion(): Promise<string>
  /** Installs that version globally. */
  install(version: string): Promise<void>
  /** The folder of the globally installed package. */
  globalPackageRoot(): Promise<string>
}

export interface UpdateSeams {
  /** The package this `wi` runs from: its skill, plugin build and changelog. */
  packageRoot: string
  /** The version of this `wi`. */
  version: string
  home: string
  cwd: string
  env: NodeJS.ProcessEnv
  npm: Npm
  /** Runs a `wi` entry file. With `capture`, its standard output comes back instead of printing. */
  runWi(entry: string, args: string[], capture: boolean): Promise<{ code: number; stdout: string }>
  write(text: string): void
}

export interface UpdateOptions {
  dryRun: boolean
  json: boolean
  /** The old version. Given, the install is skipped: the old `wi` did it. */
  from?: string
  vault?: string
}

export type InstallOutcome = 'installed' | 'would-install' | 'current' | 'checkout'
export type SkillOutcome = 'installed' | 'replaced' | 'current' | 'dev-link' | 'unmanaged' | 'would-install' | 'would-replace'
export type PluginOutcome =
  | 'replaced' | 'would-replace' | 'current' | 'dev-link' | 'not-installed' | 'no-vault' | 'no-build' | 'checkout'

export interface InstallStep { step: 'install'; outcome: InstallOutcome; from: string; to: string; message: string }
export interface SkillCopy { path: string; outcome: SkillOutcome; message: string }
export interface SkillStep { step: 'skill'; copies: SkillCopy[] }
export interface PluginStep {
  step: 'plugin'
  outcome: PluginOutcome
  vault: string | null
  folder: string | null
  from: string | null
  to: string | null
  message: string
}
export interface ChangesStep {
  step: 'changes'
  from: string
  to: string
  /** Null when the changes are in a package that is not installed yet (a dry run). */
  changes: ChangelogSection[] | null
  message: string
  suggest: string
}
export type UpdateStep = InstallStep | SkillStep | PluginStep | ChangesStep

export interface UpdateReport {
  dryRun: boolean
  from: string
  to: string
  steps: UpdateStep[]
}

const RELOAD = 'Reload Obsidian to load the new plugin. On the phone, force-quit Obsidian and open it again.'
const SUGGEST = 'wi doctor'

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

/** A source checkout carries `.git`: a folder, or a file in a worktree. An installed package does not. */
export async function isCheckout(root: string): Promise<boolean> {
  return exists(join(root, '.git'))
}

async function sameFile(a: string, b: string): Promise<boolean> {
  try {
    const [left, right] = await Promise.all([readFile(a), readFile(b)])
    return left.equals(right)
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

async function filesUnder(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true })
  return entries.filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(folder.length + 1))
    .sort()
}

type SkillState = 'missing' | 'dev-link' | 'unmanaged' | 'current' | 'stale'

/** What `wi setup` would find at one skill copy, read without a write. */
async function skillState(source: string, destination: string): Promise<SkillState> {
  let stat
  try {
    stat = await lstat(destination)
  } catch (error) {
    if (isMissing(error)) return 'missing'
    throw error
  }
  if (stat.isSymbolicLink()) return 'dev-link'
  if (!stat.isDirectory()) return 'unmanaged'
  const marker = await readFile(join(destination, MANAGED_MARKER), 'utf8').catch(() => null)
  if (marker !== MANAGED_TEXT) return 'unmanaged'
  const wanted = await filesUnder(source)
  const present = (await filesUnder(destination)).filter((path) => path !== MANAGED_MARKER)
  if (wanted.join('\n') !== present.join('\n')) return 'stale'
  for (const path of wanted) {
    if (!await sameFile(join(source, path), join(destination, path))) return 'stale'
  }
  return 'current'
}

async function skillStep(root: string, home: string, dryRun: boolean): Promise<SkillStep> {
  const source = join(root, 'skills', 'recursive-board')
  if (!await exists(join(source, 'SKILL.md'))) throw new Error(`the recursive-board skill is missing from ${root}.`)
  const destinations = skillDestinations(home)
  const copies: SkillCopy[] = []
  for (const path of destinations) {
    const state = await skillState(source, path)
    let outcome: SkillOutcome
    if (state === 'missing') {
      outcome = dryRun ? 'would-install' : 'installed'
      if (!dryRun) await installSkillCopy(source, path, false)
    } else if (state === 'stale') {
      outcome = dryRun ? 'would-replace' : 'replaced'
      if (!dryRun) {
        // The marker says wi setup made this folder, so it holds no file of the user's.
        await rm(path, { recursive: true, force: true })
        await installSkillCopy(source, path, false)
      }
    } else {
      outcome = state
    }
    copies.push({ path, outcome, message: skillMessage(outcome, path) })
  }
  return { step: 'skill', copies }
}

function skillMessage(outcome: SkillOutcome, path: string): string {
  switch (outcome) {
    case 'installed': return `skill installed at ${path}`
    case 'replaced': return `skill replaced at ${path}`
    case 'current': return `skill already current at ${path}`
    case 'dev-link': return `skill left alone at ${path}: it is a symlink to a development copy`
    case 'unmanaged': return `skill left alone at ${path}: wi setup did not install it. Read it, then run wi setup --force to replace it`
    case 'would-install': return `skill would be installed at ${path}`
    case 'would-replace': return `skill would be replaced at ${path}`
  }
}

/** The vault in the order of docs/adr/0059-find-the-vault-in-four-ways.md, or null when none is found. */
async function findVault(flag: string | undefined, seams: UpdateSeams): Promise<string | null> {
  const hint = flag ?? seams.env['WI_VAULT']
  if (hint) return resolve(seams.cwd, hint)
  const here = findVaultRoot(seams.cwd)
  if (here) return here
  const configured = await getDefaultVault(seams.env)
  return configured ? resolve(configured) : null
}

async function manifestOf(path: string): Promise<{ id: string; version: string } | null> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    return typeof value['id'] === 'string' && typeof value['version'] === 'string'
      ? { id: value['id'], version: value['version'] }
      : null
  } catch {
    return null
  }
}

async function packageVersion(root: string): Promise<string | null> {
  try {
    const value = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as Record<string, unknown>
    return typeof value['version'] === 'string' ? value['version'] : null
  } catch {
    return null
  }
}

async function pluginStep(root: string, vault: string | null, checkout: boolean, dryRun: boolean): Promise<PluginStep> {
  const base = { step: 'plugin' as const, vault, folder: null, from: null, to: null }
  if (checkout) {
    return { ...base, outcome: 'checkout', message: `plugin left alone: wi runs from a source checkout, whose dist/ can be stale. `
      + `Run npm run build, then npm run install:vault -- --vault <path>` }
  }
  if (vault === null) {
    return { ...base, outcome: 'no-vault', message: 'plugin skipped: no vault found. Pass --vault <path>, set WI_VAULT, or run wi setup' }
  }
  const built = join(root, 'dist')
  const manifest = await manifestOf(join(built, 'manifest.json'))
  for (const file of PLUGIN_FILES) {
    if (manifest === null || !await exists(join(built, file))) {
      return { ...base, outcome: 'no-build', message: `plugin skipped: the package has no plugin build in ${built}` }
    }
  }
  const folder = join(vault, '.obsidian', 'plugins', manifest!.id)
  const to = manifest!.version
  let stat
  try {
    stat = await lstat(folder)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  if (!stat?.isDirectory() && !stat?.isSymbolicLink()) {
    return { ...base, folder, to, outcome: 'not-installed', message: `plugin not installed in ${vault}: ${folder} does not exist. `
      + 'wi update does not install it. Install it from Settings, Community plugins, once it is listed there. '
      + `Or copy main.js, manifest.json and styles.css from ${built} into that folder, then enable Recursive Board` }
  }
  const from = (await manifestOf(join(folder, 'manifest.json')))?.version ?? null
  const withFolder = { ...base, folder, from, to }
  const linkMessage = `plugin left alone at ${folder}: it is a symlink to a development build`
  if (stat.isSymbolicLink()) return { ...withFolder, outcome: 'dev-link', message: linkMessage }
  for (const file of PLUGIN_FILES) {
    if ((await lstat(join(folder, file)).catch(() => null))?.isSymbolicLink()) {
      return { ...withFolder, outcome: 'dev-link', message: linkMessage }
    }
  }
  let same = true
  for (const file of PLUGIN_FILES) same = same && await sameFile(join(built, file), join(folder, file))
  if (same) return { ...withFolder, outcome: 'current', message: `plugin already current at ${folder} (${to})` }
  const change = `${from ?? 'unknown'} → ${to}`
  if (dryRun) return { ...withFolder, outcome: 'would-replace', message: `plugin would be replaced at ${folder} (${change})` }
  for (const file of PLUGIN_FILES) {
    // A rename in the same folder replaces each file whole, so Obsidian and a sync client never see half a file.
    const temporary = join(folder, `.${file}.wi-update-${process.pid}`)
    await copyFile(join(built, file), temporary)
    await rename(temporary, join(folder, file))
  }
  return { ...withFolder, outcome: 'replaced', message: `plugin replaced at ${folder} (${change}). ${RELOAD}` }
}

async function changesStep(root: string, from: string, to: string, installed: boolean): Promise<ChangesStep> {
  const base = { step: 'changes' as const, from, to, suggest: SUGGEST }
  if (!installed) {
    return { ...base, changes: null, message: `would print the Agent setup changes after ${from}, up to ${to}` }
  }
  const text = await readFile(join(root, 'CHANGELOG.md'), 'utf8').catch((error: unknown) => {
    if (isMissing(error)) return null
    throw error
  })
  const changes = text === null ? [] : agentSetupSince(text, from, to)
  let message: string
  if (compareVersions(from, to) >= 0) message = 'no Agent setup changes: the version is the same'
  else if (changes.length === 0) message = `no Agent setup changes since ${from}`
  else message = `Agent setup changes since ${from}:`
  return { ...base, changes, message }
}

/** Steps 2 to 4, from the package this `wi` runs from. */
export async function updateFromPackage(
  options: { from: string; to: string; dryRun: boolean; vault?: string },
  seams: UpdateSeams,
): Promise<UpdateReport> {
  const checkout = await isCheckout(seams.packageRoot)
  const vault = await findVault(options.vault, seams)
  const steps: UpdateStep[] = [
    await skillStep(seams.packageRoot, seams.home, options.dryRun),
    await pluginStep(seams.packageRoot, vault, checkout, options.dryRun),
    await changesStep(seams.packageRoot, options.from, options.to, options.to === seams.version),
  ]
  return { dryRun: options.dryRun, from: options.from, to: options.to, steps }
}

/** The text lines of the steps, for a person. */
export function renderSteps(steps: UpdateStep[]): string {
  const out: string[] = []
  for (const step of steps) {
    if (step.step === 'skill') {
      for (const copy of step.copies) out.push(`wi update: ${copy.message}`)
      continue
    }
    out.push(`wi update: ${step.message}`)
    if (step.step === 'changes') {
      for (const change of step.changes ?? []) out.push('', `## ${change.version}`, '', change.text)
      if (step.changes?.length) out.push('')
      out.push(`Run ${step.suggest} to compare your vault with the agent playbook.`)
    }
  }
  return `${out.join('\n')}\n`
}

function print(report: UpdateReport, json: boolean, seams: UpdateSeams): void {
  seams.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderSteps(report.steps))
}

export async function runUpdate(options: UpdateOptions, seams: UpdateSeams): Promise<number> {
  const { dryRun, json } = options
  const vault = options.vault === undefined ? {} : { vault: options.vault }
  const current = seams.version

  if (options.from !== undefined) {
    try {
      compareVersions(options.from, current)
    } catch {
      throw new Error(`--from needs a version such as 0.8.2, not "${options.from}".`)
    }
    print(await updateFromPackage({ from: options.from, to: current, dryRun, ...vault }, seams), json, seams)
    return 0
  }

  let install: InstallStep
  if (await isCheckout(seams.packageRoot)) {
    install = { step: 'install', outcome: 'checkout', from: current, to: current,
      message: `install skipped: wi runs from a source checkout at ${seams.packageRoot}. Update it with git, then run npm run build` }
  } else {
    const latest = await seams.npm.latestVersion()
    if (compareVersions(latest, current) <= 0) {
      install = { step: 'install', outcome: 'current', from: current, to: current,
        message: `${PACKAGE_NAME} ${current} is current. Refreshing the skill and plugin copies` }
    } else if (dryRun) {
      install = { step: 'install', outcome: 'would-install', from: current, to: latest,
        message: `would install ${PACKAGE_NAME} ${latest} (now ${current}). The steps below read this version's files; the new version may differ` }
    } else {
      await seams.npm.install(latest)
      const root = await seams.npm.globalPackageRoot()
      const entry = join(root, 'dist', 'wi', 'wi.js')
      if (!await exists(entry)) throw new Error(`npm installed ${PACKAGE_NAME}, but ${entry} is missing.`)
      const installed = await packageVersion(root) ?? latest
      install = { step: 'install', outcome: 'installed', from: current, to: installed,
        message: `installed ${PACKAGE_NAME} ${installed} (was ${current})` }
      const args = ['update', '--from', current, ...(json ? ['--json'] : []), ...(options.vault ? ['--vault', options.vault] : [])]
      if (!json) seams.write(renderSteps([install]))
      const result = await seams.runWi(entry, args, json)
      if (json) {
        let rest: UpdateReport
        try {
          rest = JSON.parse(result.stdout) as UpdateReport
        } catch {
          throw new Error(`the new wi did not print a JSON report (exit ${result.code}). Run wi update --from ${current} to finish.`)
        }
        print({ ...rest, from: current, steps: [install, ...rest.steps] }, json, seams)
      }
      return result.code
    }
  }
  const rest = await updateFromPackage({ from: install.from, to: install.to, dryRun, ...vault }, seams)
  print({ ...rest, steps: [install, ...rest.steps] }, json, seams)
  return 0
}

/** Runs npm. Its own output goes to standard error, so `--json` output stays one document. */
function npm(args: string[], capture: boolean): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    // npm is npm.cmd on Windows, which only a shell can start.
    const child = spawn('npm', args, { stdio: ['ignore', capture ? 'pipe' : 2, 2], shell: process.platform === 'win32' })
    let stdout = ''
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout.trim())
      else reject(new Error(`npm ${args.join(' ')} failed with exit code ${code}.`))
    })
  })
}

export function realUpdateSeams(packageRoot: string, version: string): UpdateSeams {
  return {
    packageRoot,
    version,
    home: homedir(),
    cwd: process.cwd(),
    env: process.env,
    npm: {
      latestVersion: () => npm(['view', PACKAGE_NAME, 'version'], true),
      install: async (target) => { await npm(['install', '--global', `${PACKAGE_NAME}@${target}`], false) },
      globalPackageRoot: async () => join(await npm(['root', '--global'], true), PACKAGE_NAME),
    },
    runWi: (entry, args, capture) => new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, [entry, ...args], { stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'] })
      let stdout = ''
      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
      child.on('error', reject)
      child.on('close', (code) => resolvePromise({ code: code ?? 2, stdout }))
    }),
    write: (text) => { process.stdout.write(text) },
  }
}
