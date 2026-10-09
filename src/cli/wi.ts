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
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { loadVault, findVaultRoot, getDefaultVault } from './vault.ts'
import { nodePort } from './node-port.ts'
import {
  loadVault as loadVaultFrom, maxAgentsForRun, type Vault, type WorkItem,
} from '../shared/vault.ts'
import { createContext, isRegistered, runCommand, UsageError } from '../shared/runner.ts'
import { createItem } from './commands/new.ts'
import { claimItem, releaseItem } from './commands/claim-release.ts'
import { delegate } from './commands/delegate.ts'
import { addNote } from './commands/note.ts'
import { setTag } from './commands/tag.ts'
import { removeItem } from './commands/remove.ts'
import { moveItem } from './commands/move.ts'
import { archiveItem } from './commands/archive.ts'
import { setPromoted } from './commands/promote.ts'
import { setArea } from './commands/area.ts'
import { setDependency } from './commands/depend.ts'
import { setPeople } from './commands/set.ts'
import { titleOf } from '../shared/item-dependencies.ts'
import { runSetup } from './commands/setup.ts'
import { npmLatestVersion, renderDoctor, runDoctor } from './commands/doctor.ts'
import { realUpdateSeams, runUpdate } from './commands/update.ts'
import { packageRoot } from './package-files.ts'
import { activeAgentsOf } from '../shared/commands/agents.ts'
import { giveVerdict, sendForReview } from './commands/review.ts'
import { parseCommandLine, type Values } from '../shared/command-line.ts'
import { COMMAND_FLAGS, renderHelp } from '../shared/command-table.ts'
import { STATUSES } from '../shared/schema.ts'
import { authorLabel } from '../shared/authorship.ts'
import { roleTagFor } from '../shared/role-tags.ts'
import { isAnyAgent } from '../shared/holder.ts'
import { versionLine } from '../shared/rules-version.ts'


const VERSION = '0.9.0'

async function main(argv: string[]): Promise<number> {
  if (argv[0] === 'trace') {
    process.stdout.write('wi trace was removed in 0.8.0. Use wi show <ref> --json to read a card\'s Knowledge links.\n')
    return 0
  }
  const { values, positionals } = parseCommandLine(argv)

  if (values.version) {
    process.stdout.write(`${versionLine(VERSION)}\n`)
    return 0
  }
  const [command, ...rest] = positionals
  if (values.help || command === undefined || command === 'help') {
    process.stdout.write(renderHelp())
    return command === undefined && !values.help ? 2 : 0
  }
  if (!(command in COMMAND_FLAGS)) throw new UsageError(`unknown command "${command}". Run wi --help.`)
  if (command === 'setup') {
    if (rest.length > 0) throw new UsageError('wi setup takes options only. Run wi setup --help for usage.')
    await runSetup({
      ...(typeof values['vault'] === 'string' ? { vault: values['vault'] } : {}),
      yes: values['yes'] === true,
      json: values['json'] === true,
      force: values['force'] === true,
    })
    return 0
  }
  if (command === 'update') {
    if (rest.length > 0) throw new UsageError('wi update takes options only. Run wi --help for usage.')
    return runUpdate({
      dryRun: values['dry-run'] === true,
      json: values.json === true,
      ...(typeof values['from'] === 'string' ? { from: values['from'] } : {}),
      ...(typeof values['vault'] === 'string' ? { vault: values['vault'] } : {}),
    }, realUpdateSeams(packageRoot(), VERSION))
  }

  if (command === 'doctor') {
    if (rest.length > 0) throw new UsageError('wi doctor takes options only. Run wi --help for usage.')
    const report = await runDoctor({
      version: VERSION,
      ...(typeof values['vault'] === 'string' ? { vaultFlag: values['vault'] } : {}),
      env: process.env,
      cwd: process.cwd(),
      home: homedir(),
      nodeVersion: process.versions.node,
      latestVersion: () => npmLatestVersion(process.env),
    })
    if (values.json === true) print(report)
    else process.stdout.write(renderDoctor(report))
    return report.broken ? 1 : 0
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

  if (command === 'dashboard') {
    process.stdout.write('wi dashboard is retired. Use wi agents for the agent count and limit. A dashboard is a separate plugin; the README names an example.\n')
    return 0
  }

  if (command === 'retag' || command === 'graph') {
    process.stdout.write('wi retag and wi graph were removed in 0.8.0. The board tree shows each card\'s area.\n')
    return 0
  }

  const root = await openRoot(text(values, 'vault'))
  if (isRegistered(command)) {
    const context = createContext({
      port: nodePort(root),
      version: VERSION,
      env: process.env,
      out: (text) => process.stdout.write(text),
      err: (text) => process.stderr.write(text),
    })
    return (await runCommand(context, { command, positionals, values })).code
  }
  const vault = await loadVault(root)
  const json = values.json === true

  switch (command) {
    case 'new':
      return runNew(vault, rest, values, json)
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
    case 'approve':
    case 'send-back':
      return runVerdict(vault, command, rest, values, json)
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
    default:
      throw new UsageError(`unknown command "${command}". Run wi --help.`)
  }
}

/** A string flag's value, or undefined when it was not given. */
function text(values: Values, key: string): string | undefined {
  const value = values[key]
  return typeof value === 'string' ? value : undefined
}

async function openRoot(flag: string | undefined): Promise<string> {
  const root = await resolveVaultRoot(flag)
  if (findVaultRoot(root) !== root) {
    throw new UsageError(`${root} is not a vault: it has no Boards/ folder or board settings.`)
  }
  return root
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

  const created = await createItem(vault, {
    title,
    parent,
    ...(typeof values['status'] === 'string' ? { status: values['status'] as never } : {}),
    ...(typeof values['owner'] === 'string' ? { owner: values['owner'] } : {}),
    ...(typeof values['holder'] === 'string' ? { holder: values['holder'] } : {}),
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

async function runSet(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  const pick = (key: string) => typeof values[key] === 'string' ? values[key] as string : undefined
  const options = { ...optional('owner', pick('owner')), ...optional('role', pick('role')) }
  if (ref === '' || Object.keys(options).length === 0) {
    throw new UsageError('wi set needs a <ref> and --owner, or --role "" to remove an old role field.')
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

async function runClaim(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi claim needs a <ref> and --holder <name>, or WI_AGENT set.')
  // An agent claims by its own name, which its session sets in WI_AGENT.
  const agent = values['holder'] === undefined ? envText('WI_AGENT') : singleLineOption(values, 'holder')
  if (agent === undefined) throw new UsageError('wi claim needs --holder <name>, or WI_AGENT set.')
  const maxAgents = maxAgentsForRun(vault, process.env)
  const before = maxAgents === null ? new Set<string>() : await activeAgentsOf(vault)
  const change = await claimItem(vault, ref, agent)
  if (json) print({ id: change.item.id, path: change.item.relPath, holder: change.holder,
    from: change.from ?? null, to: change.to, changed: change.changed })
  else process.stdout.write(change.changed
    ? `${label(change.item)}  ${change.from ?? '—'} → doing  (holder: ${agent})\n`
    : `${label(change.item)} is already claimed by ${agent} in doing. Nothing written.\n`)
  if (change.changed && maxAgents !== null) {
    // Count after the claim: it can move a step to doing and leave the parent's agent only waiting.
    // A person, a request for any agent, and an agent that only waits add no agent.
    const after = await activeAgentsOf(await loadVaultFrom(vault.port, vault.seams))
    const name = agent.trim().toLowerCase()
    if (!before.has(name) && after.has(name) && after.size > maxAgents) {
      process.stderr.write(`wi: warning: agent limit is ${maxAgents}; ${after.size} agents now work a doing card.\n`)
    }
  }
  return 0
}

async function runDelegate(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi delegate needs a <ref> and --to <person|agent>.')
  const to = singleLineOption(values, 'to')
  const role = values['role'] === undefined ? undefined : singleLineOption(values, 'role')
  const result = await delegate(vault, ref, { to, role })
  if (json) print({ id: result.item.id ?? null, path: result.item.relPath, holder: result.holder })
  else {
    const what = isAnyAgent(result.holder) ? 'any agent may take it' : `assigned to ${result.holder}`
    process.stdout.write(`${label(result.item)}  ${result.item.status}  (${what})\n`)
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
  const note = values['note'] === undefined ? '' : String(values['note'])
  const result = await sendForReview(vault, ref, to, files, note, authorLabel(envText('WI_AGENT'), envText('WI_MODEL')))
  if (json) print({ id: result.item.id ?? null, path: result.item.relPath, owner: result.to, files: result.files })
  else process.stdout.write(`${label(result.item)}  sent to ${result.to} for review` +
    `${result.files.length ? `  (${result.files.join(', ')})` : ''}\n`)
  return 0
}

async function runVerdict(vault: Vault, command: 'approve' | 'send-back', rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '' || values['you'] === undefined) throw new UsageError(`wi ${command} needs a <ref> and --you <name>, the reviewer the card's owner names.`)
  const you = singleLineOption(values, 'you')
  const writer = authorLabel(envText('WI_AGENT'), envText('WI_MODEL'))
  const signed = writer === undefined ? {} : { writer }
  let comment = ''
  if (values['comment'] !== undefined) {
    comment = String(values['comment'])
    if (/[\r\n]/.test(comment)) throw new UsageError('--comment must be one line.')
  }
  const verdict = command === 'approve'
    ? { verdict: 'approve' as const, you, ...signed }
    : { verdict: 'send back' as const, you, comment, ...signed }
  const result = await giveVerdict(vault, ref, verdict)
  if (json) {
    print({
      id: result.item.id ?? null, path: result.item.relPath, verdict: verdict.verdict, you, status: result.status,
      parent_ready: result.parentReady?.id ?? null, unblocked: result.unblocked.map((item) => item.id ?? item.stem),
    })
    return 0
  }
  if (command === 'approve') process.stdout.write(`${label(result.item)}  approved by ${you}  doing → done\n`)
  else process.stdout.write(`${label(result.item)}  sent back by ${you}  (owner removed; it stays in doing)\n`)
  for (const item of result.unblocked) process.stdout.write(`${label(item)}  waits on nothing open now. It can start.\n`)
  const ready = result.parentReady
  if (ready) {
    process.stdout.write(`${label(ready)}  every child is done. If its own criteria are met, run: ` +
      `wi status ${ready.id ?? ready.stem} done\n`)
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
  const added = await addNote(vault, ref, text, { agent: agent ?? envText('WI_AGENT'), model: envText('WI_MODEL') })
  if (json) print({ id: added.item.id, path: added.item.relPath, line: added.line })
  else process.stdout.write(`${label(added.item)}  ${added.line}\n`)
  return 0
}

async function runRelease(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi release needs a <ref> and --reason <text>.')
  const reason = singleLineOption(values, 'reason')
  const where = values['where'] === undefined ? undefined : singleLineOption(values, 'where')
  const change = await releaseItem(vault, ref, reason, where, authorLabel(envText('WI_AGENT'), envText('WI_MODEL')))
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

function label(item: WorkItem): string {
  return `${item.id ?? '(no id)'}  ${item.title ?? item.stem}`
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
