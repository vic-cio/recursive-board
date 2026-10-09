/**
 * `wi children` — read one work item's board.
 *
 * This is the read an agent makes before it decides anything, so it returns both the flat list and
 * the four status groups. With no explicit order field, sibling
 * order is `priority` then `updated`, computed by the vault index.
 */
import { STATUSES, isStatus, type Status } from '../schema.ts'
import { dependenciesOf, openDependencies } from '../item-dependencies.ts'
import type { Vault, WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { json, label } from './output.ts'

export interface ChildRow {
  item: WorkItem
  /** How many children this child has. Shown in the card's child-count badge. */
  childCount: number
  /** 0 for a direct child. Above 0 only when the listing recursed. */
  depth: number
  archived: boolean
}

export interface ChildListing {
  parent: WorkItem
  children: ChildRow[]
  areas: ChildRow[]
  byStatus: Map<Status, ChildRow[]>
  /** Set when the parent chain loops back on itself, which integrity rule 3 forbids. */
  cycle: boolean
}

export interface ChildrenOptions {
  status?: string
  recursive?: boolean
  archived?: boolean
}

export function listChildren(
  vault: Vault,
  ref: string,
  options: ChildrenOptions = {},
): ChildListing {
  const { status, recursive = false, archived = false } = options
  if (status !== undefined && !isStatus(status)) {
    throw new Error(`"${status}" is not a status. Use one of: ${STATUSES.join(', ')}.`)
  }

  const parent = vault.resolve(ref)
  const rows: ChildRow[] = []
  const areas: ChildRow[] = []
  const seen = new Set<string>([parent.relPath])
  let cycle = false

  const walk = (item: WorkItem, depth: number): void => {
    for (const child of vault.childrenOf(item)) {
      if (seen.has(child.relPath)) {
        cycle = true // Integrity rule 3. Report it; never repair it.
        continue
      }
      seen.add(child.relPath)
      const effectiveArchived = vault.isArchived(child)
      if (!effectiveArchived || archived) {
        const row = { item: child, childCount: vault.childrenOf(child).filter((kid) => !vault.isArchived(kid) || archived).length, depth, archived: effectiveArchived }
        if (child.area) areas.push(row)
        else rows.push(row)
      }
      if (recursive) walk(child, depth + 1)
    }
  }
  walk(parent, 0)

  const filtered = status === undefined ? rows : rows.filter((r) => r.item.status === status)
  const filteredAreas = status === undefined ? areas : areas.filter((r) => r.item.status === status)

  const byStatus = new Map<Status, ChildRow[]>()
  for (const value of STATUSES) {
    byStatus.set(value, filtered.filter((r) => r.item.status === value))
  }

  return { parent, children: filtered, areas: filteredAreas, byStatus, cycle }
}

/** `wi children <ref>`: the four status groups, or the flat list with --tree or --status. */
export const runChildren: RunFunction = async (context, line) => {
  const vault = await context.vault()
  const { values } = line
  const rest = line.positionals.slice(1)
  if (rest.length === 0) throw new UsageError('wi children needs a <ref>. A project\'s AGENTS.md names its board.')
  const ref = rest.join(' ').trim()
  if (ref === '') throw new UsageError('wi children needs a <ref>.')

  const listing = listChildren(vault, ref, {
    ...(typeof values['status'] === 'string' ? { status: values['status'] } : {}),
    recursive: values['tree'] === true,
    archived: values['archived'] === true,
  })

  if (values['json'] === true) {
    context.out(json({
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
    }))
    return 0
  }

  const out: string[] = [
    `${label(listing.parent)}${listing.parent.board ? '  [board]' : ''}`,
  ]
  if (listing.areas.length > 0) {
    out.push(`  Areas (${listing.areas.length})`)
    for (const row of listing.areas) out.push(`    ${'  '.repeat(row.depth)}${rowLine(row, vault)}`)
  }
  if (listing.children.length === 0 && listing.areas.length === 0) {
    out.push('  no children')
  } else if (values['tree'] === true || typeof values['status'] === 'string') {
    for (const row of listing.children) out.push(`  ${'  '.repeat(row.depth)}${rowLine(row, vault)}`)
  } else {
    for (const [status, rows] of listing.byStatus) {
      out.push(`  ${status} (${rows.length})`)
      for (const row of rows) out.push(`    ${rowLine(row, vault)}`)
    }
  }
  if (listing.cycle) out.push('  ! the parent chain loops. Run wi validate.')
  context.out(`${out.join('\n')}\n`)
  return 0
}

/** One child as a line: id, status, title, then its markers. */
function rowLine(row: ChildRow, vault: Vault): string {
  const status = row.item.status ?? '—'
  const kids = row.childCount > 0 ? `  (${row.childCount})` : ''
  const board = row.item.board ? '  [board]' : ''
  const area = row.item.area ? '  [area]' : ''
  const archived = row.archived ? '  [archived]' : ''
  const open = row.item.status === 'done' ? 0 : openDependencies(vault, row.item).length
  const waits = open > 0 ? `  [waits on ${open}]` : ''
  return `${row.item.id ?? '(no id)'}  ${status.padEnd(7)}  ${row.item.title ?? row.item.stem}${kids}${board}${area}${waits}${archived}`
}
