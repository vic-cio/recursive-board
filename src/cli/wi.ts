#!/usr/bin/env node
/**
 * `wi` — the only thing that writes into the vault.
 *
 * docs/adr/0004-wi-is-the-programmatic-write-interface.md: agents call this rather than editing Markdown with `sed`, so the integrity rules
 * live in tested code instead of in prose. That only holds if this is strictly better than `sed`,
 * which is why every command takes an id, a filename or a title, and why every error says what to
 * do next rather than only what went wrong.
 *
 * Exit codes: 0 fine, 1 the vault has errors, 2 the command could not run.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  loadVault, findVaultRoot, getDefaultVault, maxAgentsForRun, readPeople,
  type Vault, type WorkItem,
} from './vault.ts'
import { createItem } from './commands/new.ts'
import { setStatus } from './commands/status.ts'
import { claimItem, releaseItem } from './commands/claim-release.ts'
import { delegate, runGit, spawnWorker } from './commands/delegate.ts'
import { addNote } from './commands/note.ts'
import { setTag } from './commands/tag.ts'
import { listChildren, type ChildRow } from './commands/children.ts'
import { readyCards } from './commands/ready.ts'
import { showCard } from './commands/show.ts'
import { validate, type Problem } from './commands/validate.ts'
import { removeItem } from './commands/remove.ts'
import { moveItem } from './commands/move.ts'
import { archiveItem } from './commands/archive.ts'
import { setPromoted } from './commands/promote.ts'
import { setArea } from './commands/area.ts'
import { setDependency } from './commands/depend.ts'
import { setPeople } from './commands/set.ts'
import { dependenciesOf, openDependencies, titleOf } from './dependencies.ts'
import { hookStatus, installHook, uninstallHook } from './commands/hook.ts'
import { runSetup } from './commands/setup.ts'
import { dashboardPanels, dashboardSummary, renderDashboard, type DashboardPanel } from './commands/dashboard.ts'
import { sendForReview } from './commands/review.ts'
import { COMMAND_FLAGS, parseCommandLine, type Values } from './flags.ts'
import { STATUSES } from '../shared/schema.ts'
import { authorLabel } from '../shared/authorship.ts'
import { roleTagFor } from '../shared/role-tags.ts'
import { holderOf, isAnyAgent } from '../shared/holder.ts'

const HELP = `wi — the Recursive Board CLI

Usage
  wi setup [--yes] [--vault <path>] [--force]
  wi new <title> [--parent <ref>] [--status <s>] [--template <t>] [--owner <o>] [--agent <holder>]
                 [--priority <n>] [--objective <text>] [--context <text>]... [--criteria <text>]...
                 [--tag <tag>]... [--creator <name>] [--model <id>] [--strict]
  wi status <ref> <status>
  wi note <ref> <text> [--agent <name>]
  wi area <ref> [--off]
  wi tag <ref> <tag> [--off]
  wi depend <ref> --on <ref> [--off]
  wi set <ref> [--owner <name>] [--role ""] [--creator <name> [--model <id>]]
  wi claim <ref> --agent <name>
  wi delegate <ref> --to <person|agent|claude|codex|pi> [--model <id>] [--agent <name>]
                 [--permission <mode>] [--role <name>]
  wi review <ref> --to <name> [--files <path>]...
  wi agents
  wi dashboard [--panel <review|progress|agents|people|attention>]... [--you <name>] [--parent <ref>] [--json]
  wi release <ref> --reason <text> [--where <branch-or-path>]
  wi move <ref> --to <ref>
  wi archive <ref> [--undo]
  wi promote <ref>
  wi demote <ref>
  wi rm <ref> [--recursive] [--dry-run]
  wi children [<ref>] [--status <s>] [--tree] [--archived]
  wi ready [--parent <ref>] [--agent <name>] [--json]
  wi show <ref> [--json]
  wi validate
  wi hook <install|uninstall|status> [--force]
  wi here         Retired. A project's AGENTS.md names its board.

A <ref> is a work item id, a filename or a title. An id always wins.
A <status> is one of: ${STATUSES.join(', ')}.
Options
  --vault <path>   The vault root. Defaults to $WI_VAULT, the vault this folder is in, then defaultVault.
  --json           Machine-readable output.
  --force          Replace an unrelated hook, or an unmanaged skill during setup.
  --yes            Run setup without prompts; requires --vault <path>.
  -h, --help       This text.
  -V, --version    Print the version.

Notes
  wi retag and wi graph were removed in 0.8.0. The board tree shows each card's area.
  Each command takes only the flags its usage line shows, plus --vault and --json where it reads a
  vault or prints a result. It refuses any other flag with exit 2 and names the flag.
  \`wi new\` writes the brief: --objective once, --context and --criteria once per paragraph or
  criterion. It warns when the card has no Objective or Acceptance Criteria; --strict refuses it.
  \`wi new\` and \`wi note\` wrap bare angle placeholders in backticks in Markdown body text. They
  preserve code, links, autolinks, and HTML.
  A title's unsafe filename characters become hyphens. When another item has the same filename,
  the new file gets the id's suffix; wi never writes over a file.
  \`wi new\` makes a parent a board when it gives the parent its first child. Set
  "autoPromote": false in the board settings to turn this off. A root or an area is never changed.
  \`wi new --tag <tag>\` adds a free tag; repeat it for more. A role is a tag such as role/checker:
  a note that is not a work item and carries the same tag is that role's procedure. Roles do not
  inherit. --role is retired and names the --tag to use.
  --creator and --model are accepted no-ops for compatibility. --strict checks only the brief.
  \`wi tag <ref> <tag>\` adds a free tag to a card, and --off removes it. Case and a leading # do not
  matter. It refuses old area/ tags, which remain on cards until the owner chooses a cleanup.
  \`wi set\` changes a card's owner (an empty value removes it), and writes its creator and model
  only when it has none: a creator is set once. --role "" removes an old role field; a role is a tag.
  \`wi note\` appends "- <date> <time>, <writer>: <text>" under Notes. It signs WI_AGENT or --agent,
  and adds WI_MODEL when set. It refuses a note with no writer name. The write re-reads the card under a lock, so two notes at once both survive.
  \`wi status <ref> done\` says when that was the parent's last open child. It does not close the parent.
  Unticking a done item is \`wi status <ref> <its prev_status>\`, which also clears the record.
  \`wi validate\` exits 1 when the vault has errors, so it works as a pre-commit hook.
  \`wi template\` is retired. Use \`wi new --template\` to choose a template when you create a work item.
  \`wi rm\` moves a file to the vault's .trash. It refuses an item that has children
  unless you pass --recursive, because removing a parent leaves its children on no board.
  \`wi move\` changes only the item's parent. Its status stays, and its children follow it.
  \`wi rm\`, \`wi move\` and \`wi archive\` refuse while a hidden non-Markdown file sits in the work-item
  folder, because the index cannot read it and may be missing a work item. Let the sync
  client download the file, or delete the stray file, then retry. There is no --force.
  \`wi archive\` changes one flag. Descendants disappear with their parent at read time.
  \`wi area <ref>\` marks a card as an area and keeps its status. It refuses a card with a holder.
  Use \`wi area <ref> --off\` to convert back without changing its status.
  \`wi depend <ref> --on <ref>\` makes a card wait on another card; --off removes that. \`wi claim\`
  and \`wi status <ref> doing\` refuse a card with an open dependency. \`wi children\` marks it
  [waits on N].
  \`wi status <ref> done\` names each card it unblocks. An archived card that is not done still blocks.
  A card's holder field names the person or agent who does its work. An old card's agent field
  is read as its holder. The holder value agent asks for any agent: \`wi ready\` lists those cards
  first, and a claim replaces agent with the claimant's name.
  \`wi claim\` writes the holder and moves the card to doing. It lets an agent hold a card and its
  subtasks at once. It refuses a board with a child in doing that a different agent or a person works.
  \`wi delegate\` sets the holder and nothing else: the status stays. \`--to <person>\` names a person
  (a note with type: person) and writes no note. \`--to agent\` writes holder: agent and starts nothing.
  \`--to claude|codex|pi\` names the worker <model>-<slug> (or <harness>-<slug> with no --model) as holder,
  makes a worktree of this Git repository on card/<slug> beside it, in <repo>-worktrees/, and starts that harness headless with the card body as its
  brief. The worker runs \`wi claim\` on its card when it starts, which moves it to doing. The note names the log, <repo>-worktrees/<slug>.log, and the command that resumes the session.
  --permission passes the harness's own mode: claude takes --permission-mode (default auto), codex
  takes --sandbox (default workspace-write), and pi has none. The default never bypasses permissions.
  --role <name> adds the tag role/<name> to the card in the same write. The worker's brief names each
  role tag on the card and the note that carries it. With no role tag, the worker follows the skill.
  \`wi objective\` is retired. Use \`wi show <ref> --json\` to read a card and its ancestor objectives.
  \`wi agents\` is retired. Use \`wi dashboard --panel agents\`.
  \`wi dashboard\` prints the same panels as the plugin. Repeat --panel to choose panels; without it,
  wi prints every panel. --parent names a root or an area. It writes nothing.
  \`wi review <ref> --to <name> [--files <path>]...\` sends a card to a person note for review. Each --files
  adds one vault-relative path. The command sets owner and appends a Review note in one write.
  The board settings live in the Recursive Board plugin settings, stored in
  .obsidian/plugins/recursive-board/data.json. wi reads them and never writes them.
  \`wi new\` warns when a hidden file sits in the work-item folder, because a new id or filename may clash with it.
  \`wi here\` is retired and changes nothing. A project's AGENTS.md names its board: pass it as --parent.
  \`wi trace\` was removed in 0.8.0. Use \`wi show <ref> --json\` to read a card's Knowledge links.
`

const VERSION = '0.8.0'

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === 'trace') {
    process.stdout.write('wi trace was removed in 0.8.0. Use wi show <ref> --json to read a card\'s Knowledge links.\n')
    return 0
  }
  const { values, positionals } = parseCommandLine(argv)

  if (values.version) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }
  const [command, ...rest] = positionals
  if (values.help || command === undefined || command === 'help') {
    process.stdout.write(HELP)
    return command === undefined && !values.help ? 2 : 0
  }
  if (!(command in COMMAND_FLAGS)) throw new UsageError(`unknown command "${command}". Run wi --help.`)
  if (command === 'setup') {
    if (rest.length > 0) throw new UsageError('wi setup takes options only. Run wi setup --help for usage.')
    await runSetup({
      ...(typeof values['vault'] === 'string' ? { vault: values['vault'] } : {}),
      yes: values['yes'] === true,
      force: values['force'] === true,
      cliEntry: fileURLToPath(import.meta.url),
    })
    return 0
  }

  if (command === 'here') return runHere()

  if (command === 'template') {
    process.stdout.write('wi template is retired. Use wi new --template to choose a template when you create a work item.\n')
    return 0
  }

  if (command === 'objective') {
    process.stdout.write('wi objective is retired. Use wi show <ref> --json to read a card and its ancestor objectives.\n')
    return 0
  }

  if (command === 'retag' || command === 'graph') {
    process.stdout.write('wi retag and wi graph were removed in 0.8.0. The board tree shows each card\'s area.\n')
    return 0
  }

  const vault = await openVault(text(values, 'vault'))
  const json = values.json === true

  switch (command) {
    case 'new':
      return runNew(vault, rest, values, json)
    case 'status':
      return runStatus(vault, rest, json)
    case 'area':
      return runArea(vault, rest, values, json)
    case 'note':
      return runNote(vault, rest, values, json)
    case 'tag':
      return runTag(vault, rest, values, json)
    case 'depend':
      return runDepend(vault, rest, values, json)
    case 'set':
      return runSet(vault, rest, values, json)
    case 'claim':
      return runClaim(vault, rest, values, json)
    case 'delegate':
      return runDelegate(vault, rest, values, json)
    case 'review':
      return runReview(vault, rest, values, json)
    case 'agents':
      return runAgents(rest)
    case 'dashboard':
      return runDashboard(vault, rest, values, json)
    case 'ready':
      return runReady(vault, rest, values, json)
    case 'release':
      return runRelease(vault, rest, values, json)
    case 'move':
      return runMove(vault, rest, values, json)
    case 'archive':
      return runArchive(vault, rest, values, json)
    case 'promote':
      return runPromote(vault, rest, true, json)
    case 'demote':
      return runPromote(vault, rest, false, json)
    case 'rm':
      return runRemove(vault, rest, values, json)
    case 'children':
      if (rest.length === 0) throw new UsageError('wi children needs a <ref>. A project\'s AGENTS.md names its board.')
      return runChildren(vault, rest, values, json)
    case 'show':
      return runShow(vault, rest, json)
    case 'validate':
      return runValidate(vault, json)
    case 'hook':
      return runHook(vault, rest, values, json)
    default:
      throw new UsageError(`unknown command "${command}". Run wi --help.`)
  }
}

/** A string flag's value, or undefined when it was not given. */
function text(values: Values, key: string): string | undefined {
  const value = values[key]
  return typeof value === 'string' ? value : undefined
}

async function openVault(flag: string | undefined): Promise<Vault> {
  const root = await resolveVaultRoot(flag)
  if (findVaultRoot(root) !== root) {
    throw new UsageError(`${root} is not a vault: it has no Boards/ folder or board settings.`)
  }
  return loadVault(root)
}

async function resolveVaultRoot(flag: string | undefined): Promise<string> {
  const hint = flag ?? process.env['WI_VAULT']
  let root = hint ? resolve(hint) : findVaultRoot(process.cwd())
  if (root === null) {
    const configured = await getDefaultVault()
    root = configured ? resolve(configured) : null
  }
  if (root === null) {
    throw new UsageError(
      'no vault found. Pass --vault <path>, set WI_VAULT, run wi inside a vault, or set defaultVault with wi setup.',
    )
  }
  return root
}

/** wi here is retired (docs/adr/0059-find-the-vault-in-four-ways.md). It exits 0 so an old script still runs. */
function runHere(): number {
  process.stdout.write('wi here is retired. A project\'s AGENTS.md names its board; pass it to wi new as --parent.\n')
  return 0
}

async function runNew(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const title = rest.join(' ').trim()
  if (title === '') throw new UsageError('wi new needs a title. Try: wi new "Build server" --parent Main')

  const explicitParent = typeof values['parent'] === 'string' ? values['parent'] : undefined
  const parent = explicitParent ?? vault.config.defaultRoot
  if (!parent) throw new UsageError('wi new needs --parent <ref>, or a defaultRoot in the board settings.')

  const priority = typeof values['priority'] === 'string' ? Number(values['priority']) : undefined
  if (priority !== undefined && !Number.isFinite(priority)) {
    throw new UsageError(`--priority must be a number, not "${values['priority']}".`)
  }

  // A role is a tag (docs/adr/0062-role-tags.md). The old flag names the new way instead of writing a field.
  if (typeof values['role'] === 'string') {
    throw new UsageError(`a role is a tag now. Use --tag ${values['role'].trim() === '' ? 'role/<name>' : roleTagFor(values['role'])}.`)
  }
  const created = await createItem(vault, {
    title,
    parent,
    ...(typeof values['status'] === 'string' ? { status: values['status'] as never } : {}),
    ...(typeof values['owner'] === 'string' ? { owner: values['owner'] } : {}),
    ...(typeof values['agent'] === 'string' ? { holder: values['agent'] } : {}),
    ...(typeof values['template'] === 'string' ? { template: values['template'] } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(Array.isArray(values['tag']) ? { tags: values['tag'] } : {}),
    brief: {
      objective: typeof values['objective'] === 'string' ? values['objective'] : undefined,
      context: Array.isArray(values['context']) ? values['context'] : undefined,
      criteria: Array.isArray(values['criteria']) ? values['criteria'] : undefined,
    },
    strict: values['strict'] === true,
  })

  if (vault.unaccounted.length > 0) {
    process.stderr.write(
      `wi: warning: a new id or filename may clash with an unread file. ` +
      `Unread files: ${vault.unaccounted.join(', ')}.\n`,
    )
  }

  if (created.gaps.length > 0) {
    process.stderr.write(`wi: warning: ${created.id} has no ${created.gaps.join(' or ')}. ` +
      `Pass --objective and --criteria, or fill the card before work starts.\n`)
  }
  if (values['creator'] !== undefined || values['model'] !== undefined) {
    process.stderr.write('wi: note: --creator and --model are accepted but ignored. New cards do not record their creator.\n')
  }
  if (created.renamed) {
    process.stderr.write(`wi: note: another item has this filename, so this one is ${created.relPath}. ` +
      `If they are different work, give the card a more specific title.\n`)
  }

  if (json) {
    print({ id: created.id, path: created.relPath, parent: created.parentStem,
      promoted_parent: created.promotedParent, gaps: created.gaps })
  } else {
    process.stdout.write(`${created.id}  ${created.relPath}  (child of ${created.parentStem})\n`)
    if (created.promotedParent) process.stdout.write(`${created.parentStem}  promoted to a board (its first child)\n`)
  }
  return 0
}

async function runStatus(vault: Vault, rest: string[], json: boolean): Promise<number> {
  const [ref, status] = rest
  if (ref === undefined || status === undefined) {
    throw new UsageError(`wi status needs a <ref> and a <status>. One of: ${STATUSES.join(', ')}.`)
  }
  const change = await setStatus(vault, ref, status)
  if (json) {
    print({
      id: change.item.id,
      path: change.item.relPath,
      from: change.from ?? null,
      to: change.to,
      prev_status: change.recorded ?? null,
      changed: change.changed,
      parent_ready: change.parentReady?.id ?? null,
      unblocked: change.unblocked.map((item) => item.id ?? item.stem),
    })
  } else if (!change.changed) {
    process.stdout.write(`${label(change.item)} is already ${change.to}. Nothing written.\n`)
  } else {
    const recorded = change.recorded ? `  (prev_status: ${change.recorded})` : ''
    process.stdout.write(`${label(change.item)}  ${change.from ?? '—'} → ${change.to}${recorded}\n`)
  }
  if (!json) {
    for (const item of change.unblocked) process.stdout.write(`${label(item)}  waits on nothing open now. It can start.\n`)
  }
  const ready = change.parentReady
  if (ready && !json) {
    process.stdout.write(`${label(ready)}  every child is done. If its own criteria are met, run: ` +
      `wi status ${ready.id ?? ready.stem} done\n`)
  }
  return 0
}

async function runSet(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  const pick = (key: string) => typeof values[key] === 'string' ? values[key] as string : undefined
  const options = {
    ...optional('owner', pick('owner')), ...optional('role', pick('role')),
    ...optional('creator', pick('creator')), ...optional('model', pick('model')),
  }
  if (ref === '' || Object.keys(options).length === 0) {
    throw new UsageError('wi set needs a <ref> and at least one of --owner, --role, --creator, --model.')
  }
  const change = await setPeople(vault, ref, options)
  if (json) print({ id: change.item.id, path: change.item.relPath, changed: change.changed })
  else process.stdout.write(change.changed.length > 0
    ? `${label(change.item)}  set ${change.changed.join(', ')}\n`
    : `${label(change.item)}  already so. Nothing written.\n`)
  return 0
}

async function runDepend(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  const on = typeof values['on'] === 'string' ? values['on'].trim() : ''
  if (ref === '' || on === '') throw new UsageError('wi depend needs a <ref> and --on <ref>. Add --off to remove the dependency.')
  const change = await setDependency(vault, ref, on, values['off'] !== true)
  if (json) {
    print({ id: change.item.id, path: change.item.relPath, on: change.on?.id ?? change.on?.stem ?? change.onRef, added: change.added, changed: change.changed })
  } else if (!change.changed) {
    process.stdout.write(`${label(change.item)} ${change.added ? 'already waits' : 'does not wait'} on ${change.on ? titleOf(change.on) : change.onRef}. Nothing written.\n`)
  } else {
    process.stdout.write(`${label(change.item)}  ${change.added ? 'waits on' : 'no longer waits on'} ${change.on ? titleOf(change.on) : change.onRef}\n`)
  }
  return 0
}

async function runTag(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  // A tag holds no space, so the last word is the tag and the words before it are the <ref>.
  const tag = rest.length > 1 ? rest[rest.length - 1]! : ''
  const ref = rest.slice(0, -1).join(' ').trim()
  if (ref === '' || tag.trim() === '') {
    throw new UsageError('wi tag needs a <ref> and a <tag>. Try: wi tag wi-a7f3 design. Add --off to remove it.')
  }
  const change = await setTag(vault, ref, tag, values['off'] !== true)
  if (json) {
    print({ id: change.item.id, path: change.item.relPath, tag: change.tag, added: change.added, changed: change.changed })
  } else if (!change.changed) {
    process.stdout.write(`${label(change.item)} ${change.added ? 'already has' : 'has no'} tag ${change.tag}. Nothing written.\n`)
  } else {
    process.stdout.write(`${label(change.item)}  ${change.added ? '+' : '-'}${change.tag}\n`)
  }
  return 0
}

async function runArea(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') {
    throw new UsageError('wi area needs a <ref>. Use --off to convert an area back to a card.')
  }
  const change = await setArea(vault, ref, {
    off: values['off'] === true,
  })
  if (json) {
    print({
      id: change.item.id,
      path: change.item.relPath,
      from: change.from,
      to: change.to,
      status: change.status ?? null,
      changed: change.changed,
    })
  } else {
    process.stdout.write(`${label(change.item)}  ${change.from} → ${change.to}` +
      `${change.status ? `  (status: ${change.status})` : ''}\n`)
  }
  return 0
}

function singleLineOption(values: Values, key: string): string {
  const value = values[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UsageError(`--${key} needs non-empty text.`)
  }
  if (/[\r\n]/.test(value)) throw new UsageError(`--${key} must be one line.`)
  return value.trim()
}

function multipleLineOption(values: Values, key: string): string[] {
  const value = values[key]
  if (typeof value === 'string') return [value]
  if (Array.isArray(value) && value.every((part) => typeof part === 'string')) return value
  throw new UsageError(`--${key} needs one or more values.`)
}

async function runClaim(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi claim needs a <ref> and --agent <name>.')
  const agent = singleLineOption(values, 'agent')
  const maxAgents = maxAgentsForRun(vault)
  const active = await activeAgentNames(vault)
  const person = (await readPeople(vault.root)).has(agent.toLowerCase())
  const change = await claimItem(vault, ref, agent)
  if (json) print({ id: change.item.id, path: change.item.relPath, holder: change.holder,
    from: change.from ?? null, to: change.to, changed: change.changed })
  else process.stdout.write(change.changed
    ? `${label(change.item)}  ${change.from ?? '—'} → doing  (holder: ${agent})\n`
    : `${label(change.item)} is already claimed by ${agent} in doing. Nothing written.\n`)
  if (change.changed && !person && maxAgents !== null && !active.has(agent) && active.size + 1 > maxAgents) {
    process.stderr.write(`wi: warning: agent limit is ${maxAgents}; ${active.size + 1} agents now have a doing card.\n`)
  }
  return 0
}

async function runDelegate(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi delegate needs a <ref> and --to <person|agent|claude|codex|pi>.')
  const pick = (key: string) => values[key] === undefined ? undefined : singleLineOption(values, key)
  const to = singleLineOption(values, 'to')
  const maxAgents = maxAgentsForRun(vault)
  const active = await activeAgentNames(vault)
  const result = await delegate(vault, ref, {
    to, model: pick('model'), agent: pick('agent'), permission: pick('permission'), role: pick('role'),
  }, {
    cwd: process.cwd(), git: runGit, launch: spawnWorker, uuid: () => crypto.randomUUID(),
    author: authorLabel(envText('WI_AGENT'), envText('WI_MODEL')),
  })
  if (json) {
    print({ id: result.item.id ?? null, path: result.item.relPath, holder: result.holder, harness: result.harness ?? null,
      branch: result.branch ?? null, worktree: result.worktree ?? null, log: result.log ?? null,
      pid: result.pid ?? null, resume: result.resume ?? null })
  } else {
    const what = result.harness ? `delegated to ${result.holder}`
      : isAnyAgent(result.holder) ? 'any agent may take it' : `assigned to ${result.holder}`
    process.stdout.write(`${label(result.item)}  ${result.item.status}  (${what})\n`)
    if (result.harness) {
      process.stdout.write(`  ${result.harness} worker, process ${result.pid}, on ${result.branch}\n` +
        `  worktree  ${result.worktree}\n  log       ${result.log}\n  resume    ${result.resume}\n`)
    }
  }
  if (result.harness && maxAgents !== null && !active.has(result.holder) && active.size + 1 > maxAgents) {
    process.stderr.write(`wi: warning: agent limit is ${maxAgents}; ${active.size + 1} agents now have a doing card.\n`)
  }
  return 0
}

async function runReview(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi review needs a <ref> and --to <name>.')
  const to = singleLineOption(values, 'to')
  const rawFiles = values['files']
  const files: string[] = typeof rawFiles === 'string'
    ? [rawFiles]
    : Array.isArray(rawFiles) ? rawFiles.filter((file): file is string => typeof file === 'string') : []
  if (files.some((file) => file.trim() === '' || /[\r\n]/.test(file))) {
    throw new UsageError('--files needs a non-empty, one-line path.')
  }
  const result = await sendForReview(vault, ref, to, files, authorLabel(envText('WI_AGENT'), envText('WI_MODEL')))
  if (json) print({ id: result.item.id ?? null, path: result.item.relPath, owner: result.to, files: result.files })
  else process.stdout.write(`${label(result.item)}  sent to ${result.to} for review` +
    `${result.files.length ? `  (${result.files.join(', ')})` : ''}\n`)
  return 0
}

/** An environment variable's text, or undefined when it is unset or blank. */
function envText(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function optional<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: string }
}

async function runNote(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const [ref, ...words] = rest
  const text = words.join(' ').trim()
  if (ref === undefined || text === '') {
    throw new UsageError('wi note needs a <ref> and the text. Try: wi note wi-a7f3 "Priced 12 lines."')
  }
  const agent = values['agent'] === undefined ? undefined : singleLineOption(values, 'agent')
  const added = await addNote(vault, ref, text, { agent: agent ?? envText('WI_AGENT'), model: envText('WI_MODEL') })
  if (json) print({ id: added.item.id, path: added.item.relPath, line: added.line })
  else process.stdout.write(`${label(added.item)}  ${added.line}\n`)
  return 0
}

/**
 * Doing cards an agent holds. One agent may hold a card and its current subtask. A card a person
 * holds is not an agent's: a person is a note with type: person. A request for any agent has no
 * agent on it yet.
 */
async function claimedDoing(vault: Vault): Promise<{ agent: string; item: WorkItem }[]> {
  const people = await readPeople(vault.root)
  return vault.items.flatMap((item) => {
    const agent = holderOf((key) => item.frontmatter.get(key))
    return item.status === 'doing' && agent !== undefined && !isAnyAgent(agent) &&
      !people.has(agent.trim().toLowerCase())
      ? [{ agent, item }]
      : []
  })
}

async function activeAgentNames(vault: Vault): Promise<Set<string>> {
  return new Set((await claimedDoing(vault)).map((claim) => claim.agent))
}

async function runAgents(rest: string[]): Promise<number> {
  if (rest.length > 0) throw new UsageError('wi agents takes no arguments.')
  process.stdout.write('wi agents is retired. Use wi dashboard --panel agents.\n')
  return 0
}

async function runDashboard(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  if (rest.length > 0) throw new UsageError('wi dashboard takes no card reference. Use --parent <ref>.')
  const allPanels: DashboardPanel[] = ['review', 'progress', 'agents', 'people', 'attention']
  const rawPanels = values['panel'] === undefined ? allPanels : multipleLineOption(values, 'panel')
  const panels = [...new Set(rawPanels.map((panel) => {
    if (!isDashboardPanel(panel)) throw new UsageError(`wi dashboard --panel needs one of: ${allPanels.join(', ')}.`)
    return panel
  }))]
  const you = values['you'] === undefined ? undefined : singleLineOption(values, 'you')
  if (you === undefined && panels.includes('review')) process.stderr.write('wi: warning: no --you <name>, so no card waits for review.\n')
  const summary = await dashboardSummary(vault, { ...(you === undefined ? {} : { you }), ...(typeof values['parent'] === 'string' ? { parent: values['parent'] } : {}) })
  if (json) print(dashboardPanels(summary, panels))
  else process.stdout.write(renderDashboard(summary, panels))
  return 0
}

function isDashboardPanel(value: string): value is DashboardPanel {
  return value === 'review' || value === 'progress' || value === 'agents' || value === 'people' || value === 'attention'
}

function runReady(vault: Vault, rest: string[], values: Values, json: boolean): number {
  if (rest.length > 0) throw new UsageError('wi ready takes no card reference.')
  const agent = values['agent'] === undefined ? undefined : singleLineOption(values, 'agent')
  const parent = typeof values['parent'] === 'string' ? values['parent'] : undefined
  const result = readyCards(vault, { ...(agent === undefined ? {} : { agent }), ...(parent === undefined ? {} : { parent }) })
  if (json) print(result)
  else {
    process.stdout.write(`${result.counts.ready} ready card${result.counts.ready === 1 ? '' : 's'}\n`)
    for (const card of result.ready) process.stdout.write(`  ${card.id ?? '?'}  ${card.title}\n`)
    if (result.counts.excluded > 0) process.stdout.write(`${result.counts.excluded} option card${result.counts.excluded === 1 ? '' : 's'} excluded; use --json for reasons.\n`)
  }
  return 0
}

async function runRelease(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi release needs a <ref> and --reason <text>.')
  const reason = singleLineOption(values, 'reason')
  const where = values['where'] === undefined ? undefined : singleLineOption(values, 'where')
  const change = await releaseItem(vault, ref, reason, where)
  if (json) print({ id: change.item.id, path: change.item.relPath, holder: change.holder,
    from: change.from ?? null, to: change.to, reason: change.reason, where: change.where ?? null,
    changed: change.changed })
  else process.stdout.write(`${label(change.item)}  ${change.from ?? '—'} → options  (released ${change.holder})\n`)
  return 0
}

async function runMove(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  const to = typeof values['to'] === 'string' ? values['to'] : ''
  if (ref === '' || to === '') {
    throw new UsageError('wi move needs a <ref> and --to <ref>. Try: wi move wi-a7f3 --to Main')
  }
  const result = await moveItem(vault, ref, to)
  if (json) {
    print({
      id: result.item.id,
      path: result.item.relPath,
      from: result.from,
      to: result.to.stem,
      changed: result.changed,
    })
  } else if (!result.changed) {
    process.stdout.write(`${label(result.item)} is already under ${result.to.stem}. Nothing written.\n`)
  } else {
    process.stdout.write(`${label(result.item)}  ${result.from ?? '—'} → ${result.to.stem}\n`)
  }
  return 0
}

async function runArchive(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi archive needs a <ref>.')
  const change = await archiveItem(vault, ref, values['undo'] === true)
  if (json) {
    print({ id: change.item.id, path: change.item.relPath, archived: change.archived, changed: change.changed })
  } else {
    const verb = change.archived ? 'archived' : 'unarchived'
    process.stdout.write(`${label(change.item)}  ${verb}${change.changed ? '' : ' (already so; nothing written)'}\n`)
  }
  return 0
}

async function runPromote(vault: Vault, rest: string[], promoted: boolean, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError(`wi ${promoted ? 'promote' : 'demote'} needs a <ref>.`)
  const change = await setPromoted(vault, ref, promoted)
  if (json) {
    print({ id: change.item.id, path: change.item.relPath, promoted: change.promoted, changed: change.changed })
  } else {
    const verb = promoted ? 'promoted' : 'demoted'
    process.stdout.write(`${label(change.item)}  ${change.changed ? verb : `already ${promoted ? 'a board' : 'a card'}; nothing written`}\n`)
  }
  return 0
}

async function runRemove(
  vault: Vault,
  rest: string[],
  values: Values,
  json: boolean,
): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi rm needs a <ref>.')

  const result = await removeItem(vault, ref, {
    recursive: values['recursive'] === true,
    dryRun: values['dry-run'] === true,
  })

  if (json) {
    print({
      dryRun: result.dryRun,
      removed: result.removed.map((r) => ({
        id: r.item.id,
        title: r.item.title,
        from: r.item.relPath,
        to: r.trashedTo,
      })),
    })
    return 0
  }

  const verb = result.dryRun ? 'would remove' : 'removed'
  for (const entry of result.removed) {
    const id = entry.item.id ?? '(no id)'
    process.stdout.write(`${verb}  ${id}  ${entry.item.relPath} -> ${entry.trashedTo}\n`)
  }
  const count = result.removed.length
  process.stdout.write(`${count} work item${count === 1 ? '' : 's'}${result.dryRun ? ', nothing written' : ''}\n`)
  return 0
}

function runShow(vault: Vault, rest: string[], json: boolean): number {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi show needs a <ref>.')
  const card = showCard(vault, ref)
  if (json) print(card)
  else process.stdout.write(`${JSON.stringify(card, null, 2)}\n`)
  return 0
}

function runChildren(vault: Vault, rest: string[], values: Values, json: boolean): number {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi children needs a <ref>.')

  const listing = listChildren(vault, ref, {
    ...(typeof values['status'] === 'string' ? { status: values['status'] } : {}),
    recursive: values['tree'] === true,
    archived: values['archived'] === true,
  })

  if (json) {
    print({
      parent: { id: listing.parent.id, path: listing.parent.relPath, board: listing.parent.board },
      cycle: listing.cycle,
      areas: listing.areas.map((row) => ({
        id: row.item.id,
        title: row.item.title,
        path: row.item.relPath,
        children: row.childCount,
        depth: row.depth,
        archived: row.archived,
      })),
      children: listing.children.map((row) => ({
        id: row.item.id,
        title: row.item.title,
        path: row.item.relPath,
        status: row.item.status ?? null,
        children: row.childCount,
        depth: row.depth,
        archived: row.archived,
        waits_on: openDependencies(vault, row.item).map((item) => item.id ?? item.stem),
        depends_on: dependenciesOf(vault, row.item).resolved.map((item) => item.id ?? item.stem),
      })),
    })
    return 0
  }

  const out: string[] = [
    `${label(listing.parent)}${listing.parent.board ? '  [board]' : ''}`,
  ]
  if (listing.areas.length > 0) {
    out.push(`  Areas (${listing.areas.length})`)
    for (const row of listing.areas) out.push(`    ${'  '.repeat(row.depth)}${row3(row, vault)}`)
  }
  if (listing.children.length === 0 && listing.areas.length === 0) {
    out.push('  no children')
  } else if (values['tree'] === true || typeof values['status'] === 'string') {
    for (const row of listing.children) out.push(`  ${'  '.repeat(row.depth)}${row3(row, vault)}`)
  } else {
    for (const [status, rows] of listing.byStatus) {
      out.push(`  ${status} (${rows.length})`)
      for (const row of rows) out.push(`    ${row3(row, vault)}`)
    }
  }
  if (listing.cycle) out.push('  ! the parent chain loops. Run wi validate.')
  process.stdout.write(`${out.join('\n')}\n`)
  return 0
}

async function runValidate(vault: Vault, json: boolean): Promise<number> {
  const report = await validate(vault)
  if (json) {
    print({
      ok: report.ok,
      items: report.itemCount,
      errors: report.errorCount,
      warnings: report.warningCount,
      problems: report.problems,
    })
    return report.ok ? 0 : 1
  }

  for (const problem of report.problems) process.stdout.write(`${line(problem)}\n`)
  const counts = `${report.itemCount} work items, ${report.errorCount} errors, ${report.warningCount} warnings`
  process.stdout.write(report.ok ? `ok: ${counts}\n` : `FAILED: ${counts}\n`)
  return report.ok ? 0 : 1
}

async function runHook(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const [action, ...extra] = rest
  if (extra.length > 0 || (action !== 'install' && action !== 'uninstall' && action !== 'status')) {
    throw new UsageError('wi hook needs install, uninstall, or status. Run wi --help.')
  }
  if (values['force'] === true && action !== 'install') {
    throw new UsageError('--force applies only to wi hook install.')
  }

  if (action === 'status') {
    const status = await hookStatus(vault.root)
    if (json) print(status)
    else {
      process.stdout.write(`vault        ${status.vault}\n`)
      process.stdout.write(`git repo     ${status.gitRepo ?? 'none — run git init in the vault'}\n`)
      if (status.gitRepo) process.stdout.write(`pre-commit   ${status.preCommit}\n`)
    }
    return 0
  }

  if (action === 'uninstall') {
    const removed = await uninstallHook(vault.root)
    if (json) print({ removed })
    else process.stdout.write(removed ? `removed ${removed}\n` : 'done\n')
    return 0
  }

  const path = await installHook(vault.root, fileURLToPath(import.meta.url), values['force'] === true)
  if (json) print({ installed: path })
  else {
    process.stdout.write(`installed ${path}\n`)
    process.stdout.write('a commit that would record an invalid vault is now refused\n')
    process.stdout.write('bypass with: git commit --no-verify\n')
  }
  const report = await validate(vault)
  if (!report.ok && !json) {
    process.stdout.write('\nheads up: the vault does not validate right now, so the next commit will be refused:\n')
    for (const problem of report.problems) process.stdout.write(`${line(problem)}\n`)
  }
  return 0
}

function line(problem: Problem): string {
  const mark = problem.severity === 'error' ? 'error' : 'warn '
  return `${mark}  ${problem.relPath}  [${problem.rule}] ${problem.message}`
}

function label(item: WorkItem): string {
  return `${item.id ?? '(no id)'}  ${item.title ?? item.stem}`
}

function row3(row: ChildRow, vault: Vault): string {
  const status = row.item.status ?? '—'
  const kids = row.childCount > 0 ? `  (${row.childCount})` : ''
  const board = row.item.board ? '  [board]' : ''
  const area = row.item.area ? '  [area]' : ''
  const archived = row.archived ? '  [archived]' : ''
  const open = row.item.status === 'done' ? 0 : openDependencies(vault, row.item).length
  const waits = open > 0 ? `  [waits on ${open}]` : ''
  return `${row.item.id ?? '(no id)'}  ${status.padEnd(7)}  ${row.item.title ?? row.item.stem}${kids}${board}${area}${waits}${archived}`
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`wi: ${message}\n`)
  process.exitCode = 2
}
