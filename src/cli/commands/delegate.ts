/**
 * `wi delegate` — hand a card to a person or start a headless worker on it
 * (docs/adr/0058-delegate-a-card.md).
 *
 * For a person it claims the card for them and notes who has it and why. For an agent it also makes
 * a worktree of the current Git repository on `card/<slug>`, starts the harness with the card body
 * as the brief, and notes the log. Every check that can fail runs before the first write. The
 * process launcher is injected, so the tests never start an agent.
 */
import { spawn, execFile } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, realpathSync, writeFileSync, writeSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { claimItem, releaseItem } from './claim-release.ts'
import { ancestorRoles } from './new.ts'
import { launchSpec, workerPrompt, type LaunchSpec } from '../harness.ts'
import { readPeople, type Vault, type WorkItem } from '../vault.ts'
import { editItem } from '../write.ts'
import { appendNote, noteLine } from '../../shared/notes.ts'
import { roleForNewCard } from '../../shared/authorship.ts'
import { frontmatterBody } from '../../shared/frontmatter.ts'
import { assignEdits, cardSlug, delegateTarget, delegationNote, workerName, type Harness } from '../../shared/delegate.ts'

export interface DelegateOptions {
  /** A person (a note with type: person), or a harness: claude, codex or pi. */
  to: string
  model?: string | undefined
  reason?: string | undefined
  /** The agent name on the claim. Defaults to `<harness>-<slug>`. */
  agent?: string | undefined
  /** The harness's permission mode or sandbox. */
  permission?: string | undefined
}

export interface DelegateDeps {
  /** The directory whose Git repository the worktree comes from. */
  cwd: string
  /** Runs git in a directory and returns its standard output. */
  git(args: string[], cwd: string): Promise<string>
  /** Starts the worker detached, its output appended to `log`, and returns its process id. */
  launch(spec: LaunchSpec, log: string): Promise<{ pid: number }>
  uuid(): string
  /** The writer named on the notes: the delegating person or agent. */
  author?: string | undefined
}

export interface DelegateResult {
  item: WorkItem
  holder: string
  harness?: Harness | undefined
  branch?: string
  worktree?: string
  log?: string
  pid?: number
  resume?: string
}

export async function delegate(
  vault: Vault,
  ref: string,
  options: DelegateOptions,
  deps: DelegateDeps,
): Promise<DelegateResult> {
  const item = vault.resolve(ref)
  const target = delegateTarget(options.to, await readPeople(vault.root))
  const note = (holder: string, harness?: Harness) => (text: string) =>
    appendNote(text, noteLine(delegationNote({ holder, harness, model: options.model, reason: options.reason }), deps.author))

  if (target.kind === 'person') {
    if (options.model !== undefined || options.permission !== undefined || options.agent !== undefined) {
      throw new Error('--model, --permission and --agent are for an agent. A person takes --reason only.')
    }
    if (item.area) throw new Error(`${item.relPath} is an area, and an area cannot be assigned.`)
    if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be assigned.`)
    await editItem(item, (text) => assignEdits(text, target.name), options.reason?.trim() ? note(target.name) : undefined)
    return { item, holder: target.name }
  }

  const harness = target.harness
  const id = item.id ?? item.stem
  const title = item.title ?? item.stem
  const slug = cardSlug(title, id)
  const branch = `card/${slug}`
  const holder = options.agent?.trim() || workerName(harness, slug)
  const repo = await mainRepository(deps)
  const folder = join(dirname(repo), `${basename(repo)}-worktrees`)
  const worktree = join(folder, slug)
  const log = join(folder, `${slug}.log`)
  const role = roleForNewCard(undefined, ancestorRoles(vault, item))
  const sessionId = deps.uuid()
  const run = {
    harness, model: options.model, permission: options.permission, worktree, vault: vault.root,
    sessionId, name: `${id} ${title}`, agent: holder, card: id, role,
  }
  launchSpec({ ...run, prompt: '' }) // Refuses a permission the harness does not take, before any write.
  const worktreeStep = await planWorktree(deps, repo, worktree, branch)

  await claimItem(vault, ref, holder, note(holder, harness))
  try {
    await worktreeStep()
    const body = frontmatterBody(await readFile(item.path, 'utf8'))
    const spec = launchSpec({
      ...run,
      prompt: workerPrompt({ card: id, title, agent: holder, vault: vault.root, worktree, branch, role, body }),
    })
    const { pid } = await deps.launch(spec, log)
    const started = `Started the worker, process ${pid}, on ${branch} in \`${worktree}\`. Log: \`${log}\`. ` +
      `Resume: \`${spec.resume}\` in the worktree.`
    await editItem(item, [], (text) => appendNote(text, noteLine(started, deps.author)))
    return { item, holder, harness, branch, worktree, log, pid, resume: spec.resume }
  } catch (error) {
    await releaseItem(vault, ref, `wi delegate could not start the worker: ${(error as Error).message}`)
    throw error
  }
}

/** The repository's main worktree, so a worker's worktree sits beside it even when wi runs in another worktree. */
async function mainRepository(deps: DelegateDeps): Promise<string> {
  let common: string
  try {
    common = (await deps.git(['rev-parse', '--path-format=absolute', '--git-common-dir'], deps.cwd)).trim()
  } catch {
    throw new Error(`wi delegate to an agent runs in a Git repository, and ${deps.cwd} is not in one. ` +
      'Run it in the repository the card works on.')
  }
  return basename(common) === '.git' ? dirname(common) : (await deps.git(['rev-parse', '--show-toplevel'], deps.cwd)).trim()
}

/**
 * Checks the worktree before any write, and returns the step that makes it. A worktree already on
 * the branch is reused, so a card delegated again carries on. A branch with no worktree gets one.
 * A new branch starts from the commit the delegating agent stands on.
 */
async function planWorktree(deps: DelegateDeps, repo: string, worktree: string, branch: string): Promise<() => Promise<void>> {
  if (existsSync(worktree)) {
    const current = await deps.git(['branch', '--show-current'], worktree).catch(() => '')
    const top = await deps.git(['rev-parse', '--show-toplevel'], worktree).catch(() => '')
    if (current.trim() !== branch || top.trim() === '' || realpathSync(top.trim()) !== realpathSync(worktree)) {
      throw new Error(`${worktree} is not a worktree of ${branch}. Move it away, or give the card another title.`)
    }
    return async () => {}
  }
  const exists = await deps.git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], repo).then(() => true, () => false)
  const head = (await deps.git(['rev-parse', 'HEAD'], deps.cwd)).trim()
  return async () => {
    await deps.git(exists ? ['worktree', 'add', worktree, branch] : ['worktree', 'add', '-b', branch, worktree, head], repo)
  }
}

const execFileAsync = promisify(execFile)

export async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd })
  return stdout
}

/**
 * Starts the worker in its own process group, so it outlives wi and the session that ran it. Its
 * output goes to the log. A prompt for standard input is kept beside the log as `<slug>.prompt.md`.
 */
export async function spawnWorker(spec: LaunchSpec, log: string): Promise<{ pid: number }> {
  mkdirSync(dirname(log), { recursive: true })
  let input: number | 'ignore' = 'ignore'
  if (spec.stdin !== undefined) {
    const promptFile = log.replace(/\.log$/, '') + '.prompt.md'
    writeFileSync(promptFile, spec.stdin)
    input = openSync(promptFile, 'r')
  }
  const output = openSync(log, 'a')
  const shown = spec.args.map((arg) => arg.length > 200 || arg.includes('\n') ? '<prompt>' : arg)
  writeSync(output, `=== ${new Date().toISOString()} ${spec.command} ${shown.join(' ')}\n`)
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const [key, value] of Object.entries(spec.env)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  try {
    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env, detached: true, stdio: [input, output, output] })
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    })
    child.unref()
    return { pid: child.pid! }
  } finally {
    if (typeof input === 'number') closeSync(input)
    closeSync(output)
  }
}
