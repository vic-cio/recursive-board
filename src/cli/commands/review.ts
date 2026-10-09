/**
 * Send a card for review, and give the verdict, with the shared edits the plugin uses
 * (docs/adr/0043-review-verdicts.md, docs/adr/0065-review-verdicts-in-wi.md).
 */
import { applyReviewRequest, applyVerdict, type Verdict } from '../../shared/review.ts'
import type { Status } from '../../shared/schema.ts'
import { readPeople, type Vault, type WorkItem } from '../../shared/vault.ts'
import { editItem } from '../../shared/edit-item.ts'
import { readyParent, unblockedBy } from '../../shared/commands/status.ts'

export interface ReviewRequest {
  item: WorkItem
  to: string
  files: string[]
}

export async function sendForReview(
  vault: Vault, ref: string, to: string, files: string[] = [], note = '', writer?: string, now: Date = new Date(),
): Promise<ReviewRequest> {
  const item = vault.resolve(ref)
  if (item.parent === null) throw new Error(`${item.relPath} is a root. A root cannot be sent for review.`)
  const name = to.trim()
  const person = (await readPeople(vault.port)).get(name.toLowerCase())
  if (person === undefined) throw new Error(`there is no person note called ${name}. Make a note with type: person.`)
  await editItem(vault, item, [], (text) => applyReviewRequest(text, {
    to: person, files, note, now, ...(writer === undefined ? {} : { writer }),
  }))
  return { item, to: person, files: files.map((file) => file.trim()).filter((file) => file !== '') }
}

export interface VerdictResult {
  item: WorkItem
  /** The card's status after the verdict: done after approve, doing after send back. */
  status: Status
  /** After approve: the open parent whose last open child this was. */
  parentReady: WorkItem | undefined
  /** After approve: cards that waited on this one and can start now. */
  unblocked: WorkItem[]
}

/**
 * Approve or send back a card. The shared edit refuses a card that does not wait for this
 * reviewer. This adds one more rule: a card with an open child does not wait for review, so a
 * verdict on one is refused here too.
 */
export async function giveVerdict(vault: Vault, ref: string, verdict: Verdict, now: Date = new Date()): Promise<VerdictResult> {
  const item = vault.resolve(ref)
  if (item.parent === null) throw new Error(`${item.relPath} is a root. A root takes no review verdict.`)
  const open = vault.childrenOf(item).filter((child) => child.status !== 'done' && !vault.isArchived(child))
  if (open.length > 0) {
    const names = open.map((child) => child.title ?? child.stem).join(', ')
    throw new Error(`${item.relPath} has ${open.length} open child${open.length === 1 ? '' : 'ren'}: ${names}. ` +
      'For review lists a card when every child is done or archived.')
  }
  await editItem(vault, item, [], (text) => applyVerdict(text, verdict, now))
  if (verdict.verdict === 'send back') return { item, status: 'doing', parentReady: undefined, unblocked: [] }
  return { item, status: 'done', parentReady: readyParent(vault, item), unblocked: unblockedBy(vault, item) }
}
