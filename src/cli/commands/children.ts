/**
 * `wi children` — read one work item's board.
 *
 * This is the read an agent makes before it decides anything, so it returns both the flat list and
 * the four status groups. The order is decision q6: there is no `order` field in v1, so sibling
 * order is `priority` then `updated`, computed by the vault index.
 */
import { STATUSES, isStatus, type Status } from '../../shared/schema.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface ChildRow {
  item: WorkItem
  /** How many children this child has. The card badge from decision u3. */
  childCount: number
  /** 0 for a direct child. Above 0 only when the listing recursed. */
  depth: number
  archived: boolean
}

export interface ChildListing {
  parent: WorkItem
  children: ChildRow[]
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
        rows.push({ item: child, childCount: vault.childrenOf(child).filter((kid) => !vault.isArchived(kid) || archived).length, depth, archived: effectiveArchived })
      }
      if (recursive) walk(child, depth + 1)
    }
  }
  walk(parent, 0)

  const filtered = status === undefined ? rows : rows.filter((r) => r.item.status === status)

  const byStatus = new Map<Status, ChildRow[]>()
  for (const value of STATUSES) {
    byStatus.set(value, filtered.filter((r) => r.item.status === value))
  }

  return { parent, children: filtered, byStatus, cycle }
}
