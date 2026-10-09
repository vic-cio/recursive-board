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
import type { Vault, WorkItem } from '../shared/vault.ts'
import { createContext, isRegistered, runCommand, UsageError } from '../shared/runner.ts'
import { createItem } from './commands/new.ts'
import { removeItem } from './commands/remove.ts'
import { moveItem } from './commands/move.ts'
import { runSetup } from './commands/setup.ts'
import { npmLatestVersion, renderDoctor, runDoctor } from './commands/doctor.ts'
import { realUpdateSeams, runUpdate } from './commands/update.ts'
import { packageRoot } from './package-files.ts'
import { parseCommandLine, type Values } from '../shared/command-line.ts'
import { COMMAND_FLAGS, renderHelp } from '../shared/command-table.ts'
import { STATUSES } from '../shared/schema.ts'
import { roleTagFor } from '../shared/role-tags.ts'
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
    case 'move':
      return runMove(vault, rest, values, json)
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
