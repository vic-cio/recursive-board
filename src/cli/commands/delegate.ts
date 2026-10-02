/**
 * `wi delegate` — hand a card to a person or start a headless worker on it
 * (docs/adr/0058-delegate-a-card.md).
 *
 * Delegating names the holder and nothing else; the status stays. For a person it writes their
 * name. For `agent` it writes the reserved holder that asks any agent. For a harness it names the
 * worker as holder, makes a worktree of the current Git repository on `card/<slug>`, starts the
 * harness with the card body as the brief, and notes the log. The worker claims the card itself.
 * Every check that can fail runs before the first write. The process launcher is injected, so the
 * tests never start an agent.
 */
import { spawn, execFile } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, realpathSync, writeFileSync, writeSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { claimRule } from './claim-release.ts'
import { launchSpec, workerPrompt, type LaunchSpec } from '../harness.ts'
import { readPeople, readRoleTaggedNotes, type Vault, type WorkItem } from '../vault.ts'
import { editItem } from '../write.ts'
import { appendNote, noteLine } from '../../shared/notes.ts'
import { procedureNotes, roleTagFor, roleTags } from '../../shared/role-tags.ts'
import { freeTagEditsIn } from '../../shared/tags.ts'
import type { Edit } from '../../shared/edits.ts'
import { cardState } from '../../shared/card-state.ts'
import { frontmatterBody, getList } from '../../shared/frontmatter.ts'
import { ANY_AGENT } from '../../shared/holder.ts'
import {
  assignEdits, cardSlug, delegateTarget, delegationNote, withdrawEdits, workerName, type Harness,
} from '../../shared/delegate.ts'

export interface DelegateOptions {
  /** A person (a note with type: person), `agent` for any agent, or a harness: claude, codex or pi. */
  to: string
  model?: string | undefined
  /** The worker's name. Defaults to `<model>-<slug>`, or `<harness>-<slug>` with no model. */
  agent?: string | undefined
  /** The harness's permission mode or sandbox. */
  permission?: string | undefined
  /** A role name or tag. The card gets the tag `role/<name>` in the same write (docs/adr/0062-role-tags.md). */
  role?: string | undefined
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
  const roleTag = options.role === undefined ? undefined : roleTagFor(options.role)
  // The holder and the role tag go in one write.
  const assign = (text: string, holder: string): Edit[] | null => {
    const edits = [...(assignEdits(text, holder) ?? []), ...(roleTag ? freeTagEditsIn(text, roleTag, true) ?? [] : [])]
    return edits.length > 0 ? edits : null
  }
  const note = (holder: string, harness: Harness) => (text: string) =>
    appendNote(text, noteLine(delegationNote({ holder, harness, model: options.model }), deps.author))

  if (target.kind !== 'agent') {
    if (options.model !== undefined || options.permission !== undefined || options.agent !== undefined) {
      throw new Error(target.kind === 'any'
        ? '--model, --permission and --agent are for a harness. --to agent starts nothing, so it takes only --to.'
        : '--model, --permission and --agent are for an agent. A person takes only --to.')
    }
    if (item.area) throw new Error(`${item.relPath} is an area, and an area cannot be assigned.`)
    if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be assigned.`)
    const holder = target.kind === 'any' ? ANY_AGENT : target.name
    await editItem(item, (text) => assign(text, holder))
    return { item, holder }
  }

  const harness = target.harness
  const id = item.id ?? item.stem
  const title = item.title ?? item.stem
  const slug = cardSlug(title, id)
  const branch = `card/${slug}`
  const holder = options.agent?.trim() || workerName(harness, slug, options.model)
  // The worker claims the card when it starts, so a card it could not claim is refused now.
  const claimable = claimRule(vault, item, holder)
  claimable(await readFile(item.path, 'utf8'))
  const repo = await mainRepository(deps)
  const folder = join(dirname(repo), `${basename(repo)}-worktrees`)
  const worktree = join(folder, slug)
  const log = join(folder, `${slug}.log`)
  const sessionId = deps.uuid()
  const run = {
    harness, model: options.model, permission: options.permission, worktree, vault: vault.root,
    sessionId, name: `${id} ${title}`, agent: holder, card: id,
  }
  launchSpec({ ...run, prompt: '' }) // Refuses a permission the harness does not take, before any write.
  const worktreeStep = await planWorktree(deps, repo, worktree, branch)

  let previous: string | undefined
  await editItem(item, (text) => {
    claimable(text)
    previous = cardState(text).holder
    return assign(text, holder)
  }, note(holder, harness))
  try {
    await worktreeStep()
    const text = await readFile(item.path, 'utf8')
    const tagged = await readRoleTaggedNotes(vault.root)
    const roles = roleTags(getList(text, 'tags') ?? []).map((tag) => ({ tag, procedures: procedureNotes(tag, tagged) }))
    const spec = launchSpec({
      ...run,
      prompt: workerPrompt({ card: id, title, agent: holder, vault: vault.root, worktree, branch, roles, body: frontmatterBody(text) }),
    })
    const { pid } = await deps.launch(spec, log)
    const started = `Started the worker, process ${pid}, on ${branch} in \`${worktree}\`. Log: \`${log}\`. ` +
      `Resume: \`${spec.resume}\` in the worktree.`
    await editItem(item, [], (text) => appendNote(text, noteLine(started, deps.author)))
    return { item, holder, harness, branch, worktree, log, pid, resume: spec.resume }
  } catch (error) {
    const reason = `wi delegate could not start ${holder}: ${(error as Error).message.replace(/\.$/, '')}.`
    await editItem(item, (text) => withdrawEdits(text, holder, previous), (text) => appendNote(text, noteLine(reason, deps.author)))
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
