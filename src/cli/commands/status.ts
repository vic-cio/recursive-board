/**
 * `wi status` — move a card between columns.
 *
 * This is the most-used write path in the system and it touches exactly one file. That property
 * is what makes a card move safe on a synced vault (spec section 37), so nothing here may write
 * to the parent.
 *
 * Decision U2 gives `done` its extra rule: going to `done` records what the item was, and leaving
 * `done` clears the record. Unticking is therefore `wi status <ref> <prev_status>`, which needs no
 * command of its own.
 */
import { editItem } from '../write.ts'
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
    return { item, from, to: status, recorded: undefined, changed: false }
  }
  const recorded = status === 'done' ? from : undefined

  await editItem(item, edits)
  return { item, from, to: status, recorded, changed: true }
}
