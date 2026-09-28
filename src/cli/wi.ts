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
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  loadVault, findVaultRoot, getDefaultVault, getRepoPointer, setRepoPointer, maxAgentsForRun,
  type Vault, type WorkItem,
} from './vault.ts'
import { createItem } from './commands/new.ts'
import { setStatus } from './commands/status.ts'
import { claimItem, releaseItem } from './commands/claim-release.ts'
import { addNote } from './commands/note.ts'
import { retag, staleAreaTags, writeGraphColours } from './commands/retag.ts'
import { listChildren, type ChildRow } from './commands/children.ts'
import { validate, type Problem } from './commands/validate.ts'
import { listTemplates, writeTemplates } from './commands/template.ts'
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
import { objectiveReport } from './commands/objective.ts'
import { STATUSES } from '../shared/schema.ts'
import { templateNames } from '../shared/templates.ts'

const HELP = `wi — the Recursive Board CLI

Usage
  wi setup [--yes] [--vault <path>] [--force]
  wi new <title> [--parent <ref>] [--status <s>] [--template <t>] [--owner <o>] [--agent <a>]
                 [--priority <n>] [--objective <text>] [--context <text>]... [--criteria <text>]...
                 [--creator <name>] [--model <id>] [--role <name>] [--strict]
  wi status <ref> <status>
  wi note <ref> <text> [--agent <name>]
  wi area <ref> [--off]
  wi depend <ref> --on <ref> [--off]
  wi set <ref> [--owner <name>] [--role <name>] [--creator <name> [--model <id>]]
  wi claim <ref> --agent <name>
  wi objective [<ref>]
  wi agents
  wi release <ref> --reason <text> [--where <branch-or-path>]
  wi move <ref> --to <ref>
  wi archive <ref> [--undo]
  wi promote <ref>
  wi demote <ref>
  wi rm <ref> [--recursive] [--dry-run]
  wi children [<ref>] [--status <s>] [--tree] [--archived]
  wi validate
  wi retag [--dry-run]
  wi graph
  wi template [list|write]
  wi hook <install|uninstall|status> [--force]
  wi here [--board <ref>] [--vault <path>]

A <ref> is a work item id, a filename or a title. An id always wins.
A <status> is one of: ${STATUSES.join(', ')}.
A <template> is one of: ${templateNames().join(', ')}.

Options
  --vault <path>   The vault root. Defaults to $WI_VAULT, the nearest vault, this repo's pointer, then defaultVault.
  --board <ref>    Board work item used by wi here.
  --json           Machine-readable output.
  --force          Replace an unrelated hook, or an unmanaged skill during setup.
  --yes            Run setup without prompts; requires --vault <path>.
  -h, --help       This text.
  -V, --version    Print the version.

Notes
  \`wi new\` writes the brief: --objective once, --context and --criteria once per paragraph or
  criterion. It warns when the card has no Objective or Acceptance Criteria; --strict refuses it.
  \`wi new\` and \`wi note\` wrap bare angle placeholders in backticks in Markdown body text. They
  preserve code, links, autolinks, and HTML.
  A title's unsafe filename characters become hyphens. When another item has the same filename,
  the new file gets the id's suffix; wi never writes over a file.
  \`wi new\` makes a parent a board when it gives the parent its first child. Set
  "autoPromote": false in .wi.json to turn this off. A root or an area is never changed.
  With "areaTags": true in .wi.json, each work item carries one tag naming its areas, such as
  area/work/website. \`wi new\` writes it. After \`wi move\` or \`wi area\`, run \`wi retag\` to fix
  the tags below. \`wi graph\` writes a colour group per area to .obsidian/graph.json and keeps
  your own groups. Close the graph view first: Obsidian may write over the file.
  \`wi new\` writes creator, creator_model and role as the plain names of person or role notes. --creator and
  --model fall back to WI_CREATOR and WI_MODEL; wi new warns when a card has no creator, and
  --strict refuses it.
  \`wi set\` changes a card's owner or role (an empty value removes it), and writes its creator and
  model only when it has none: a creator is set once.
  \`wi note\` appends "- <date> <time>, <writer>: <text>" under Notes. The writer is --agent, or
  "<WI_CREATOR or the card's role> (<WI_MODEL>)", or the card's agent. The write re-reads the card under a lock, so two notes at once both survive.
  \`wi status <ref> done\` says when that was the parent's last open child. It does not close the parent.
  Unticking a done item is \`wi status <ref> <its prev_status>\`, which also clears the record.
  \`wi validate\` exits 1 when the vault has errors, so it works as a pre-commit hook.
  \`wi template write\` regenerates Templates/ from the code, which is authoritative.
  \`wi rm\` moves a file to the vault's .trash. It refuses an item that has children
  unless you pass --recursive, because removing a parent leaves its children on no board.
  \`wi move\` changes only the item's parent. Its status stays, and its children follow it.
  \`wi rm\`, \`wi move\` and \`wi archive\` refuse while a hidden non-Markdown file sits in the work-item
  folder, because the index cannot read it and may be missing a work item. Let the sync
  client download the file, or delete the stray file, then retry. There is no --force.
  \`wi archive\` changes one flag. Descendants disappear with their parent at read time.
  \`wi area <ref>\` marks a card as an area and keeps its status. It refuses a card with an agent.
  Use \`wi area <ref> --off\` to convert back without changing its status.
  \`wi claim\` refuses a card with blocked: true, and \`wi children\` marks one [blocked].
  \`wi depend <ref> --on <ref>\` makes a card wait on another card; --off removes that. \`wi claim\`
  and \`wi status <ref> doing\` refuse a card that waits on a card that is not done, and \`wi status
  <ref> doing\` also refuses blocked: true. \`wi children\` marks a waiting card [waits on N].
  \`wi status <ref> done\` names each card it unblocks. An archived card that is not done still blocks.
  \`wi claim\` lets an agent hold a card and its subtasks at once. It refuses a board with a child in
  doing that a different agent or a person works.
  \`wi objective\` prints the WI_CARD objective chain, or the unambiguous deepest WI_AGENT claim.
  \`wi agents\` reports the advisory limit, the number of distinct agents with a doing card, and each
  claimed doing card. WI_MAX_AGENTS overrides
  maxAgents from .wi.json for one run. Dispatchers decide whether to wait; wi claim does not enforce it.
  \`wi new\` warns when such a file exists because a new id or filename may clash with it.
  \`wi here\` reads or sets this repository's vault and board pointer in your user config.
`

const VERSION = '0.3.0'

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      parent: { type: 'string' },
      to: { type: 'string' },
      creator: { type: 'string' },
      model: { type: 'string' },
      role: { type: 'string' },
      on: { type: 'string' },
      status: { type: 'string' },
      owner: { type: 'string' },
      agent: { type: 'string' },
      reason: { type: 'string' },
      where: { type: 'string' },
      priority: { type: 'string' },
      template: { type: 'string' },
      objective: { type: 'string' },
      context: { type: 'string', multiple: true },
      criteria: { type: 'string', multiple: true },
      strict: { type: 'boolean', default: false },
      vault: { type: 'string' },
      board: { type: 'string' },
      tree: { type: 'boolean', default: false },
      archived: { type: 'boolean', default: false },
      undo: { type: 'boolean', default: false },
      off: { type: 'boolean', default: false },
      recursive: { type: 'boolean', short: 'r', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'V', default: false },
    },
  })

  if (values.version) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }
  let [command, ...rest] = positionals
  if (values.help || command === undefined || command === 'help') {
    process.stdout.write(HELP)
    return command === undefined && !values.help ? 2 : 0
  }
  if (values.force && !((command === 'hook' && rest[0] === 'install') || command === 'setup')) {
    throw new UsageError('--force applies only to wi hook install or wi setup.')
  }
  if (values.yes && command !== 'setup') throw new UsageError('--yes applies only to wi setup.')
  if (values.off && command !== 'area' && command !== 'depend') throw new UsageError('--off applies only to wi area and wi depend.')
  if (values.on !== undefined && command !== 'depend') throw new UsageError('--on applies only to wi depend.')
  if ((values.objective !== undefined || values.context !== undefined || values.criteria !== undefined || values.strict) &&
    command !== 'new') {
    throw new UsageError('--objective, --context, --criteria and --strict apply only to wi new.')
  }
  if ((values.creator !== undefined || values.model !== undefined || values.role !== undefined) && command !== 'new' && command !== 'set') {
    throw new UsageError('--creator, --model and --role apply only to wi new and wi set.')
  }
  if (command === 'setup') {
    if (rest.length > 0) throw new UsageError('wi setup takes options only. Run wi setup --help for usage.')
    await runSetup({
      ...(typeof values['vault'] === 'string' ? { vault: values['vault'] } : {}),
      yes: values['yes'] === true,
      force: values['force'] === true,
    })
    return 0
  }

  if (command === 'here') return runHere(values, values.json === true)

  const vault = await openVault(values.vault)
  const json = values.json

  switch (command) {
    case 'new':
      return runNew(vault, rest, values, json)
    case 'status':
      return runStatus(vault, rest, json)
    case 'area':
      return withRetagHint(vault, () => runArea(vault, rest, values, json))
    case 'note':
      return runNote(vault, rest, values, json)
    case 'depend':
      return runDepend(vault, rest, values, json)
    case 'set':
      return runSet(vault, rest, values, json)
    case 'claim':
      return runClaim(vault, rest, values, json)
    case 'agents':
      return runAgents(vault, rest, json)
    case 'objective':
      return runObjective(vault, rest)
    case 'release':
      return runRelease(vault, rest, values, json)
    case 'move':
      return withRetagHint(vault, () => runMove(vault, rest, values, json))
    case 'archive':
      return runArchive(vault, rest, values, json)
    case 'promote':
      return runPromote(vault, rest, true, json)
    case 'demote':
      return runPromote(vault, rest, false, json)
    case 'rm':
      return runRemove(vault, rest, values, json)
    case 'children':
      if (rest.length === 0) {
        const board = await repoBoardForVault(vault)
        if (!board) throw new UsageError('wi children needs a <ref> or a matching board pointer from wi here.')
        rest = [board]
      }
      return runChildren(vault, rest, values, json)
    case 'validate':
      return runValidate(vault, json)
    case 'retag':
      return runRetag(vault, rest, values, json)
    case 'graph':
      return runGraph(vault, rest, json)
    case 'template':
      return runTemplate(vault, rest, json)
    case 'hook':
      return runHook(vault, rest, values, json)
    default:
      throw new UsageError(`unknown command "${command}". Run wi --help.`)
  }
}

async function openVault(flag: string | undefined): Promise<Vault> {
  const hint = flag ?? process.env['WI_VAULT']
  let root = hint ? resolve(hint) : findVaultRoot(process.cwd())
  if (root === null) {
    const pointer = await getRepoPointer(process.cwd())
    root = pointer ? resolve(pointer.vault) : null
  }
  if (root === null) {
    const configured = await getDefaultVault()
    root = configured ? resolve(configured) : null
  }
  if (root === null) {
    throw new UsageError(
      'no vault found. Run wi inside a vault, pass --vault <path>, set WI_VAULT, run wi here, or configure defaultVault with wi setup.',
    )
  }
  if (findVaultRoot(root) !== root) {
    throw new UsageError(`${root} is not a vault: it has no Boards/ folder or .wi.json.`)
  }
  return loadVault(root)
}

function runObjective(vault: Vault, rest: string[]): number {
  if (rest.length > 1) throw new UsageError('wi objective takes at most one <ref>. Run wi --help.')
  const report = objectiveReport(vault, rest[0])
  if (report) process.stdout.write(report)
  return 0
}

async function runHere(values: Values, json: boolean): Promise<number> {
  const start = process.cwd()
  const hasFlags = typeof values['board'] === 'string' || typeof values['vault'] === 'string'
  const needsExisting = !hasFlags || typeof values['board'] !== 'string' || typeof values['vault'] !== 'string'
  const existing = needsExisting ? await getRepoPointer(start) : null
  if (!hasFlags) {
    if (!existing) throw new UsageError('no board pointer is set for this Git repository. Run wi here --board <ref> --vault <path>.')
    if (json) process.stdout.write(`${JSON.stringify(existing)}\n`)
    else process.stdout.write(`vault  ${existing.vault}\nboard  ${existing.board}\n`)
    return 0
  }

  const vault = await openVault(typeof values['vault'] === 'string' ? values['vault'] : undefined)
  const board = typeof values['board'] === 'string'
    ? values['board']
    : existing?.board ?? vault.config.defaultRoot
  if (!board) throw new UsageError('wi here needs --board <ref> or an existing repo board pointer.')
  const resolved = vault.resolve(board)
  const pointer = { vault: vault.root, board: resolved.id ?? resolved.stem }
  await setRepoPointer(start, pointer)
  if (json) process.stdout.write(`${JSON.stringify(pointer)}\n`)
  else process.stdout.write(`set repo pointer\nvault  ${pointer.vault}\nboard  ${pointer.board}\n`)
  return 0
}

async function repoBoardForVault(vault: Vault): Promise<string | undefined> {
  const pointer = await getRepoPointer(process.cwd())
  return pointer && resolve(pointer.vault) === resolve(vault.root) ? pointer.board : undefined
}

type Values = Record<string, string | string[] | boolean | undefined>

async function runNew(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const title = rest.join(' ').trim()
  if (title === '') throw new UsageError('wi new needs a title. Try: wi new "Build server" --parent Main')

  const explicitParent = typeof values['parent'] === 'string' ? values['parent'] : undefined
  const pointerBoard = explicitParent === undefined ? await repoBoardForVault(vault) : undefined
  const parent = explicitParent ?? pointerBoard ?? vault.config.defaultRoot
  if (!parent) throw new UsageError('wi new needs --parent <ref>, a repo board pointer, or defaultRoot in .wi.json.')

  const priority = typeof values['priority'] === 'string' ? Number(values['priority']) : undefined
  if (priority !== undefined && !Number.isFinite(priority)) {
    throw new UsageError(`--priority must be a number, not "${values['priority']}".`)
  }

  const created = await createItem(vault, {
    title,
    parent,
    ...(typeof values['status'] === 'string' ? { status: values['status'] as never } : {}),
    ...(typeof values['owner'] === 'string' ? { owner: values['owner'] } : {}),
    ...(typeof values['agent'] === 'string' ? { agent: values['agent'] } : {}),
    ...(typeof values['template'] === 'string' ? { template: values['template'] } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...optional('creator', typeof values['creator'] === 'string' ? values['creator'] : envText('WI_CREATOR')),
    ...optional('model', typeof values['model'] === 'string' ? values['model'] : envText('WI_MODEL')),
    ...optional('role', typeof values['role'] === 'string' ? values['role'] : undefined),
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
  if (created.uncredited) {
    process.stderr.write(`wi: warning: ${created.id} has no creator. Pass --creator (and --model for an agent), ` +
      `or set WI_CREATOR and WI_MODEL.\n`)
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
    print({ id: change.item.id, path: change.item.relPath, on: change.on.id ?? change.on.stem, added: change.added, changed: change.changed })
  } else if (!change.changed) {
    process.stdout.write(`${label(change.item)} ${change.added ? 'already waits' : 'does not wait'} on ${titleOf(change.on)}. Nothing written.\n`)
  } else {
    process.stdout.write(`${label(change.item)}  ${change.added ? 'waits on' : 'no longer waits on'} ${titleOf(change.on)}\n`)
  }
  return 0
}

async function runArea(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') {
    throw new UsageError('wi area needs a <ref>. Use --off to convert an area back to a card.')
  }
  if (typeof values['status'] === 'string') throw new UsageError('--status does not apply to wi area; conversion preserves the current status.')
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

async function runClaim(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi claim needs a <ref> and --agent <name>.')
  const agent = singleLineOption(values, 'agent')
  const maxAgents = maxAgentsForRun(vault)
  const active = activeAgentNames(vault)
  const change = await claimItem(vault, ref, agent)
  if (json) print({ id: change.item.id, path: change.item.relPath, agent: change.agent,
    from: change.from ?? null, to: change.to, changed: change.changed })
  else process.stdout.write(change.changed
    ? `${label(change.item)}  ${change.from ?? '—'} → doing  (agent: ${agent})\n`
    : `${label(change.item)} is already claimed by ${agent} in doing. Nothing written.\n`)
  if (change.changed && maxAgents !== null && !active.has(agent) && active.size + 1 > maxAgents) {
    process.stderr.write(`wi: warning: agent limit is ${maxAgents}; ${active.size + 1} agents now have a doing card.\n`)
  }
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
  const added = await addNote(vault, ref, text, { agent, creator: envText('WI_CREATOR'), model: envText('WI_MODEL') })
  if (json) print({ id: added.item.id, path: added.item.relPath, line: added.line })
  else process.stdout.write(`${label(added.item)}  ${added.line}\n`)
  return 0
}

/** Doing cards that carry an agent. One agent may hold a card and its current subtask. */
function claimedDoing(vault: Vault): { agent: string; item: WorkItem }[] {
  return vault.items.flatMap((item) => {
    const agent = item.frontmatter.get('agent')
    return item.status === 'doing' && typeof agent === 'string' && agent.trim() !== ''
      ? [{ agent, item }]
      : []
  })
}

function activeAgentNames(vault: Vault): Set<string> {
  return new Set(claimedDoing(vault).map((claim) => claim.agent))
}

function runAgents(vault: Vault, rest: string[], json: boolean): number {
  if (rest.length > 0) throw new UsageError('wi agents takes no arguments.')
  const maxAgents = maxAgentsForRun(vault)
  const claims = claimedDoing(vault).sort((a, b) => a.agent.localeCompare(b.agent))
  const activeAgents = new Set(claims.map((claim) => claim.agent)).size
  if (json) {
    print({ maxAgents, activeAgents, claims: claims.map(({ agent, item }) => ({
      agent, id: item.id ?? null, title: item.title ?? item.stem, path: item.relPath,
    })) })
    return 0
  }
  process.stdout.write(`limit  ${maxAgents === null ? 'none' : maxAgents}\nagents with a doing card  ${activeAgents}\n`)
  for (const { agent, item } of claims) process.stdout.write(`  ${agent}  ${label(item)}\n`)
  return 0
}

async function runRelease(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi release needs a <ref> and --reason <text>.')
  const reason = singleLineOption(values, 'reason')
  const where = values['where'] === undefined ? undefined : singleLineOption(values, 'where')
  const change = await releaseItem(vault, ref, reason, where)
  if (json) print({ id: change.item.id, path: change.item.relPath, agent: change.agent,
    from: change.from ?? null, to: change.to, reason: change.reason, where: change.where ?? null,
    changed: change.changed })
  else process.stdout.write(`${label(change.item)}  ${change.from ?? '—'} → options  (released ${change.agent})\n`)
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
        blocked: row.item.frontmatter.get('blocked') === true,
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

/** A move or an area change can leave area tags below it stale. Say so, since it writes one file. */
async function withRetagHint(vault: Vault, run: () => Promise<number>): Promise<number> {
  const code = await run()
  if (vault.config.areaTags) {
    const stale = staleAreaTags(await loadVault(vault.root)).length
    if (stale > 0) process.stderr.write(`wi: ${stale} work item${stale === 1 ? ' has' : 's have'} a stale area tag. Run wi retag.\n`)
  }
  return code
}

async function runRetag(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  if (rest.length > 0) throw new UsageError('wi retag takes no arguments.')
  const dryRun = values['dry-run'] === true
  const changed = await retag(vault, dryRun)
  if (json) {
    print({ dryRun, changed: changed.map(({ item, from, to }) => ({ id: item.id ?? null, path: item.relPath, from, to })) })
    return 0
  }
  const verb = dryRun ? 'would retag' : 'retagged'
  for (const { item, to } of changed) process.stdout.write(`${verb}  ${label(item)}  [${to.join(', ')}]\n`)
  process.stdout.write(`${changed.length} work item${changed.length === 1 ? '' : 's'}${dryRun ? ', nothing written' : ''}\n`)
  return 0
}

async function runGraph(vault: Vault, rest: string[], json: boolean): Promise<number> {
  if (rest.length > 0) throw new UsageError('wi graph takes no arguments.')
  const written = await writeGraphColours(vault)
  if (json) print(written)
  else process.stdout.write(`wrote ${written.groups} area colour groups to ${written.path}, kept ${written.kept} of your own\n` +
    'reopen the graph view to see them\n')
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

async function runTemplate(vault: Vault, rest: string[], json: boolean): Promise<number> {
  const action = rest[0] ?? 'list'

  if (action === 'list') {
    const templates = listTemplates()
    if (json) {
      print(templates.map((t) => ({
        name: t.name,
        description: t.description,
        sections: t.sections.map((s) => s.heading),
      })))
      return 0
    }
    for (const template of templates) {
      process.stdout.write(`${template.name.padEnd(14)}  ${template.description}\n`)
      process.stdout.write(`${' '.repeat(16)}${template.sections.map((s) => s.heading).join(', ')}\n`)
    }
    return 0
  }

  if (action === 'write') {
    const written = await writeTemplates(vault)
    if (json) {
      print(written)
      return 0
    }
    for (const entry of written) {
      process.stdout.write(`${entry.outcome.padEnd(10)}${entry.relPath}\n`)
    }
    return 0
  }

  throw new UsageError(`wi template takes "list" or "write", not "${action}".`)
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
  const archived = row.archived ? '  [archived]' : ''
  const blocked = row.item.frontmatter.get('blocked') === true ? '  [blocked]' : ''
  const open = row.item.status === 'done' ? 0 : openDependencies(vault, row.item).length
  const waits = open > 0 ? `  [waits on ${open}]` : ''
  return `${row.item.id ?? '(no id)'}  ${status.padEnd(7)}  ${row.item.title ?? row.item.stem}${kids}${board}${blocked}${waits}${archived}`
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
