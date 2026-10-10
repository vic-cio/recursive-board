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
import { editItem } from '../edit-item.ts'
import { dependentsOf, openWaits, titleOf } from '../item-dependencies.ts'
import { waitingRefusal } from '../dependencies.ts'
import { statusEditsIn } from '../transitions.ts'
import { cardState } from '../card-state.ts'
import { isStatus, STATUSES, type Status } from '../schema.ts'
import type { Vault, WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { json, label } from './output.ts'

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

  // Decided under the lock, from the card as it is then (docs/adr/0054-edits-from-the-file-at-write-time.md).
  let from = item.status
  let changed = false
  await editItem(vault, item, (text) => {
    const state = cardState(text)
    from = state.status
    // Moving to done clears the card's person waits: that is how a person approves a review.
    const edits = statusEditsIn(text, status, (target) => vault.personNamed(target) !== undefined)
    if (edits === null) return null
    if (status === 'doing') refuseStart(vault, item, text)
    changed = true
    return edits
  })
  if (!changed) {
    return { item, from, to: status, recorded: undefined, changed: false, parentReady: undefined, unblocked: [] }
  }
  const done = status === 'done'
  return {
    item, from, to: status, recorded: done ? from : undefined, changed: true,
    parentReady: done ? readyParent(vault, item) : undefined,
    unblocked: done ? unblockedBy(vault, item) : [],
  }
}

/** The same checks as `wi claim`, so an agent cannot start a card by moving it (docs/adr/0041-card-dependencies.md). */
function refuseStart(vault: Vault, item: WorkItem, text: string): void {
  const waiting = openWaits(vault, item, text)
  if (waiting.cards.length + waiting.people.length > 0) {
    throw new Error(waitingRefusal(item.relPath, waiting.cards.map(titleOf), waiting.people))
  }
}

/** Cards that waited on this one and wait on nothing open now it is done. A person wait stays open. */
export function unblockedBy(vault: Vault, item: WorkItem): WorkItem[] {
  return dependentsOf(vault, item).filter((dependent) => {
    const waits = openWaits(vault, dependent)
    return dependent.status !== 'done' && !vault.isArchived(dependent) &&
      waits.people.length === 0 && waits.cards.every((open) => open === item)
  })
}

/** The open parent whose last open child this card was. */
export function readyParent(vault: Vault, item: WorkItem): WorkItem | undefined {
  const parent = vault.resolveLink(item.parent)
  if (parent === undefined || !parent.frontmatter.has('parent') || parent.area || parent.status === 'done') return undefined
  const open = vault.childrenOf(parent).filter((child) => !child.archived && child !== item && child.status !== 'done')
  return open.length === 0 ? parent : undefined
}

/** `wi status <ref> <status>`: what it prints, from the change setStatus made. */
export const runStatus: RunFunction = async (context, line) => {
  const vault = await context.vault()
  const [ref, status] = line.positionals.slice(1)
  if (ref === undefined || status === undefined) {
    throw new UsageError(`wi status needs a <ref> and a <status>. One of: ${STATUSES.join(', ')}.`)
  }
  const change = await setStatus(vault, ref, status)
  if (line.values['json'] === true) {
    context.out(json({
      id: change.item.id,
      path: change.item.relPath,
      from: change.from ?? null,
      to: change.to,
      prev_status: change.recorded ?? null,
      changed: change.changed,
      parent_ready: change.parentReady?.id ?? null,
      unblocked: change.unblocked.map((item) => item.id ?? item.stem),
    }))
    return 0
  }
  if (!change.changed) {
    context.out(`${label(change.item)} is already ${change.to}. Nothing written.\n`)
  } else {
    const recorded = change.recorded ? `  (prev_status: ${change.recorded})` : ''
    context.out(`${label(change.item)}  ${change.from ?? '—'} → ${change.to}${recorded}\n`)
  }
  for (const item of change.unblocked) context.out(`${label(item)}  waits on nothing open now. It can start.\n`)
  const ready = change.parentReady
  if (ready) {
    context.out(`${label(ready)}  every child is done. If its own criteria are met, run: ` +
      `wi status ${ready.id ?? ready.stem} done\n`)
  }
  return 0
}
