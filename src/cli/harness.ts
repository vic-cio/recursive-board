/**
 * The command line that starts a headless worker on each harness (docs/adr/0058-delegate-a-card.md).
 *
 * Pure, so the tests check every flag without starting an agent. The default permission is the
 * mode a worker needs to edit its worktree and run `wi`, never a bypass: Claude Code's `auto`
 * and Codex's `workspace-write` sandbox. pi has no permission modes, so it takes none.
 */
import type { Harness } from '../shared/delegate.ts'

export interface WorkerRun {
  harness: Harness
  /** The model id. Without one, the harness uses its own default. */
  model?: string | undefined
  /** The harness's own permission mode or sandbox. Without one, the default below. */
  permission?: string | undefined
  worktree: string
  vault: string
  prompt: string
  /** A UUID, so a person can resume the worker's session. */
  sessionId: string
  /** The session's display name. */
  name: string
  /** The worker's name: its holder name and WI_AGENT. */
  agent: string
  /** The card id. */
  card: string
}

export interface LaunchSpec {
  command: string
  args: string[]
  cwd: string
  /** Text for the process's standard input, or undefined for none. */
  stdin: string | undefined
  /** Variables to set on top of the caller's environment. An undefined value removes the variable. */
  env: Record<string, string | undefined>
  /** The command that resumes the session, run in the worktree. */
  resume: string
}

const PERMISSIONS: Record<Harness, { default: string; allowed: readonly string[] } | null> = {
  claude: { default: 'auto', allowed: ['acceptEdits', 'auto', 'bypassPermissions', 'dontAsk', 'manual', 'plan'] },
  codex: { default: 'workspace-write', allowed: ['read-only', 'workspace-write', 'danger-full-access'] },
  pi: null,
}

function permissionFor(harness: Harness, asked: string | undefined): string | undefined {
  const modes = PERMISSIONS[harness]
  if (modes === null) {
    if (asked !== undefined) throw new Error(`${harness} has no permission modes. Leave out --permission.`)
    return undefined
  }
  if (asked === undefined) return modes.default
  if (!modes.allowed.includes(asked)) {
    throw new Error(`${harness} takes --permission ${modes.allowed.join(', ')}, not "${asked}".`)
  }
  return asked
}

export function launchSpec(run: WorkerRun): LaunchSpec {
  const permission = permissionFor(run.harness, run.permission)
  const model = run.model?.trim() || undefined
  const env = {
    WI_VAULT: run.vault, WI_CARD: run.card, WI_AGENT: run.agent,
    WI_MODEL: model,
  }
  const base = { cwd: run.worktree, env }
  switch (run.harness) {
    case 'claude':
      // --add-dir takes several values, so it comes last and the prompt goes on stdin.
      return {
        ...base, command: 'claude', stdin: run.prompt, resume: `claude --resume ${run.sessionId}`,
        args: ['-p', ...(model ? ['--model', model] : []), '--permission-mode', permission!,
          '--session-id', run.sessionId, '--name', run.name, '--add-dir', run.vault],
      }
    case 'codex':
      return {
        ...base, command: 'codex', stdin: run.prompt, resume: 'codex resume',
        args: ['exec', ...(model ? ['-m', model] : []), '-s', permission!,
          ...(permission === 'workspace-write' ? ['-c', 'sandbox_workspace_write.network_access=true'] : []),
          '-C', run.worktree, '--add-dir', run.vault, '-'],
      }
    case 'pi':
      // A saved session, so a person can open the run afterwards.
      return {
        ...base, command: 'pi', stdin: undefined, resume: `pi --session-id ${run.sessionId}`,
        args: ['-p', ...(model ? ['--model', model] : []), '--session-id', run.sessionId,
          '--name', run.name, '--', run.prompt],
      }
  }
}

export interface BriefContext {
  card: string
  title: string
  agent: string
  vault: string
  worktree: string
  branch: string
  /** Each role tag on the card, with the notes that carry it (docs/adr/0062-role-tags.md). */
  roles?: readonly { tag: string; procedures: readonly string[] }[] | undefined
  /** The card's text below its frontmatter. */
  body: string
}

/** The worker's prompt: where it stands and how to report, then the card body as its brief. */
export function workerPrompt(context: BriefContext): string {
  const lines = [
    `You are ${context.agent}, a worker on the card ${context.card} "${context.title}" in the Recursive Board vault at ${context.vault}.`,
    `Your working directory is the worktree ${context.worktree}, on the branch ${context.branch}. Commit your work there. Do not push or merge it.`,
    'Read AGENTS.md in your working directory before you change anything.',
    'Use wi for every write to the vault. The WI_ environment variables that wi reads are set for you.',
    `Follow "Working under a dispatcher" in the recursive-board skill, with ${context.agent} as your agent name.`,
    `You hold the card. Run wi claim ${context.card} --agent ${context.agent} before you start: it moves the card to doing.`,
    ...(context.roles ?? []).map(roleLine),
    'Work until the card is done without asking questions. Nobody reads your output until you finish.',
    '',
    'The card body is your brief:',
    '',
  ]
  return `${lines.join('\n')}\n${context.body.replace(/^\s*\n/, '')}`
}

/** One role tag in the brief. A tag that no note carries names no procedure, and that is fine. */
function roleLine(role: { tag: string; procedures: readonly string[] }): string {
  const notes = role.procedures.map((path) => `\`${path}\``)
  if (notes.length === 0) return `Your card has the role tag #${role.tag}. No note carries it, so it names no procedure.`
  if (notes.length === 1) return `Your card has the role tag #${role.tag}. Read ${notes[0]}: it is your procedure.`
  return `Your card has the role tag #${role.tag}. Several notes carry it: ${notes.join(', ')}. Read them all.`
}
