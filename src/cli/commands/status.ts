/**
 * `wi status` — move a card between columns.
 *
 * This is the most-used write path in the system and it touches exactly one file. That property
 * is what makes a card move safe on a synced vault (spec section 37), so nothing here may write
 * to the parent.
 *
 * The shared status transition records the prior status: going to `done` records what the item was, and leaving
 * `done` clears the record. Unticking is therefore `wi status <ref> <prev_status>`, which needs no
 * command of its own.
 */
import { editItem } from '../write.ts'
import { dependentsOf, openDependencies, titleOf } from '../dependencies.ts'
import { waitingRefusal } from '../../shared/dependencies.ts'
import { statusEdits } from '../../shared/transitions.ts'
import { isStatus, STATUSES, type Status } from '../../shared/schema.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface StatusChange {
  item: WorkItem
  from: Status | undefined
  to: Status
  /** The value written to `prev_status`, when the move was into `done`. */
  recorded: Status | undefined
  changed: boolean
  /**
   * The parent, when this move made the last of its children done and the parent is still open.
   * `wi status` only reports it. Closing the parent is a judgement for whoever owns it, and a
   * write to the parent would break one file per operation.
   */
  parentReady: WorkItem | undefined
  /** Cards that waited on this one and wait on nothing open now it is done. */
  unblocked: WorkItem[]
}

export async function setStatus(vault: Vault, ref: string, status: string): Promise<StatusChange> {
  if (!isStatus(status)) {
    throw new Error(`"${status}" is not a status. Use one of: ${STATUSES.join(', ')}.`)
  }

  const item = vault.resolve(ref)
  if (item.parent === null) {
    throw new Error(
      `${item.relPath} is a root, and a root is not a card in anyone's column. It takes no status.`,
    )
  }

  const from = item.status
  const edits = statusEdits(from, status, item.frontmatter.has('prev_status'))
  if (edits === null) {
    return { item, from, to: status, recorded: undefined, changed: false, parentReady: undefined, unblocked: [] }
  }
  if (status === 'doing') refuseStart(vault, item)
  const recorded = status === 'done' ? from : undefined
  const unblocked = status === 'done' ? unblockedBy(vault, item) : []

  await editItem(item, edits)
  return { item, from, to: status, recorded, changed: true, parentReady: status === 'done' ? readyParent(vault, item) : undefined, unblocked }
}

/** The same checks as `wi claim`, so an agent cannot start a card by moving it (docs/adr/0041-card-dependencies.md). */
function refuseStart(vault: Vault, item: WorkItem): void {
  if (item.frontmatter.get('blocked') === true) {
    throw new Error(`${item.relPath} is blocked. Clear its blocked flag when the block is gone, or start another card.`)
  }
  const waiting = openDependencies(vault, item)
  if (waiting.length > 0) throw new Error(waitingRefusal(item.relPath, waiting.map(titleOf)))
}

function unblockedBy(vault: Vault, item: WorkItem): WorkItem[] {
  return dependentsOf(vault, item).filter((dependent) =>
    dependent.status !== 'done' && !vault.isArchived(dependent) &&
    openDependencies(vault, dependent).every((open) => open === item))
}

function readyParent(vault: Vault, item: WorkItem): WorkItem | undefined {
  const parent = vault.resolveLink(item.parent)
  if (parent === undefined || !parent.frontmatter.has('parent') || parent.area || parent.status === 'done') return undefined
  const open = vault.childrenOf(parent).filter((child) => !child.archived && child !== item && child.status !== 'done')
  return open.length === 0 ? parent : undefined
}
