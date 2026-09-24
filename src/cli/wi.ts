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

import { loadVault, findVaultRoot, type Vault, type WorkItem } from './vault.ts'
import { createItem } from './commands/new.ts'
import { setStatus } from './commands/status.ts'
import { claimItem, releaseItem } from './commands/claim-release.ts'
import { listChildren, type ChildRow } from './commands/children.ts'
import { validate, type Problem } from './commands/validate.ts'
import { listTemplates, writeTemplates } from './commands/template.ts'
import { removeItem } from './commands/remove.ts'
import { moveItem } from './commands/move.ts'
import { archiveItem } from './commands/archive.ts'
import { hookStatus, installHook, uninstallHook } from './commands/hook.ts'
import { runSetup } from './commands/setup.ts'
import { STATUSES } from '../shared/schema.ts'
import { templateNames } from '../shared/templates.ts'

const HELP = `wi — the Recursive Board CLI

Usage
  wi setup [--yes] [--vault <path>] [--force]
  wi new <title> [--parent <ref>] [--status <s>] [--template <t>] [--owner <o>] [--agent <a>]
                                [--priority <n>]
  wi status <ref> <status>
  wi claim <ref> --agent <name>
  wi release <ref> --reason <text> [--where <branch-or-path>]
  wi move <ref> --to <ref>
  wi archive <ref> [--undo]
  wi rm <ref> [--recursive] [--dry-run]
  wi children <ref> [--status <s>] [--tree] [--archived]
  wi validate
  wi template [list|write]
  wi hook <install|uninstall|status> [--force]

A <ref> is a work item id, a filename or a title. An id always wins.
A <status> is one of: ${STATUSES.join(', ')}.
A <template> is one of: ${templateNames().join(', ')}.

Options
  --vault <path>   The vault root. Defaults to $WI_VAULT, then the nearest configured vault or Boards/.
  --json           Machine-readable output.
  --force          Replace an unrelated hook, or an unmanaged skill during setup.
  --yes            Run setup without prompts; requires --vault <path>.
  -h, --help       This text.
  -V, --version    Print the version.

Notes
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
  \`wi new\` warns when such a file exists because a new id or filename may clash with it.
`

const VERSION = '0.1.2'

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      parent: { type: 'string' },
      to: { type: 'string' },
      status: { type: 'string' },
      owner: { type: 'string' },
      agent: { type: 'string' },
      reason: { type: 'string' },
      where: { type: 'string' },
      priority: { type: 'string' },
      template: { type: 'string' },
      vault: { type: 'string' },
      tree: { type: 'boolean', default: false },
      archived: { type: 'boolean', default: false },
      undo: { type: 'boolean', default: false },
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
  const [command, ...rest] = positionals
  if (values.help || command === undefined || command === 'help') {
    process.stdout.write(HELP)
    return command === undefined && !values.help ? 2 : 0
  }
  if (values.force && !((command === 'hook' && rest[0] === 'install') || command === 'setup')) {
    throw new UsageError('--force applies only to wi hook install or wi setup.')
  }
  if (values.yes && command !== 'setup') throw new UsageError('--yes applies only to wi setup.')
  if (command === 'setup') {
    if (rest.length > 0) throw new UsageError('wi setup takes options only. Run wi setup --help for usage.')
    await runSetup({
      ...(typeof values['vault'] === 'string' ? { vault: values['vault'] } : {}),
      yes: values['yes'] === true,
      force: values['force'] === true,
    })
    return 0
  }

  const vault = await openVault(values.vault)
  const json = values.json

  switch (command) {
    case 'new':
      return runNew(vault, rest, values, json)
    case 'status':
      return runStatus(vault, rest, json)
    case 'claim':
      return runClaim(vault, rest, values, json)
    case 'release':
      return runRelease(vault, rest, values, json)
    case 'move':
      return runMove(vault, rest, values, json)
    case 'archive':
      return runArchive(vault, rest, values, json)
    case 'rm':
      return runRemove(vault, rest, values, json)
    case 'children':
      return runChildren(vault, rest, values, json)
    case 'validate':
      return runValidate(vault, json)
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
  const root = hint ? resolve(hint) : findVaultRoot(process.cwd())
  if (root === null) {
    throw new UsageError(
      'no vault found. Run wi inside a vault, pass --vault <path>, or set WI_VAULT.',
    )
  }
  if (findVaultRoot(root) !== root) {
    throw new UsageError(`${root} is not a vault: it has no Boards/ folder or .wi.json.`)
  }
  return loadVault(root)
}

type Values = Record<string, string | boolean | undefined>

async function runNew(vault: Vault, rest: string[], values: Values, json: boolean): Promise<number> {
  const title = rest.join(' ').trim()
  if (title === '') throw new UsageError('wi new needs a title. Try: wi new "Build server" --parent Main')

  const parent = typeof values['parent'] === 'string' ? values['parent'] : vault.config.defaultRoot
  if (!parent) throw new UsageError('wi new needs --parent <ref> or defaultRoot in .wi.json.')

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
  })

  if (vault.unaccounted.length > 0) {
    process.stderr.write(
      `wi: warning: a new id or filename may clash with an unread file. ` +
      `Unread files: ${vault.unaccounted.join(', ')}.\n`,
    )
  }

  if (json) print({ id: created.id, path: created.relPath, parent: created.parentStem })
  else process.stdout.write(`${created.id}  ${created.relPath}  (child of ${created.parentStem})\n`)
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
    })
  } else if (!change.changed) {
    process.stdout.write(`${label(change.item)} is already ${change.to}. Nothing written.\n`)
  } else {
    const recorded = change.recorded ? `  (prev_status: ${change.recorded})` : ''
    process.stdout.write(`${label(change.item)}  ${change.from ?? '—'} → ${change.to}${recorded}\n`)
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
  const change = await claimItem(vault, ref, agent)
  if (json) print({ id: change.item.id, path: change.item.relPath, agent: change.agent,
    from: change.from ?? null, to: change.to, changed: change.changed })
  else process.stdout.write(change.changed
    ? `${label(change.item)}  ${change.from ?? '—'} → doing  (agent: ${agent})\n`
    : `${label(change.item)} is already claimed by ${agent} in doing. Nothing written.\n`)
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
      children: listing.children.map((row) => ({
        id: row.item.id,
        title: row.item.title,
        path: row.item.relPath,
        status: row.item.status ?? null,
        children: row.childCount,
        depth: row.depth,
        archived: row.archived,
      })),
    })
    return 0
  }

  const out: string[] = [
    `${label(listing.parent)}${listing.parent.board ? '  [board]' : ''}`,
  ]
  if (listing.children.length === 0) {
    out.push('  no children')
  } else if (values['tree'] === true || typeof values['status'] === 'string') {
    for (const row of listing.children) out.push(`  ${'  '.repeat(row.depth)}${row3(row)}`)
  } else {
    for (const [status, rows] of listing.byStatus) {
      out.push(`  ${status} (${rows.length})`)
      for (const row of rows) out.push(`    ${row3(row)}`)
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

function row3(row: ChildRow): string {
  const status = row.item.status ?? '—'
  const kids = row.childCount > 0 ? `  (${row.childCount})` : ''
  const board = row.item.board ? '  [board]' : ''
  const archived = row.archived ? '  [archived]' : ''
  return `${row.item.id ?? '(no id)'}  ${status.padEnd(7)}  ${row.item.title ?? row.item.stem}${kids}${board}${archived}`
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
