/**
 * Your verdict on a card that waits for your review (docs/adr/0043-review-verdicts.md).
 *
 * Approve writes a note and closes the card. Send back writes a note, with your comment if any, and removes
 * the owner, so the card leaves For review and goes back to its agent in doing. Each is one write
 * to the card's own file. This module imports nothing from Node.
 */
import { applyStampedEdits, type Edit } from './edits.ts'
import { parseFrontmatter } from './frontmatter.ts'
import { appendNote, noteLine } from './notes.ts'
import { isStatus, today } from './schema.ts'
import { statusEdits } from './transitions.ts'

export type Verdict =
  | { verdict: 'approve'; you: string }
  | { verdict: 'send back'; you: string; comment: string }

export function applyVerdict(text: string, verdict: Verdict, now: Date = new Date()): string {
  const you = verdict.you.trim()
  if (you === '') throw new Error('set your name in the Recursive Board settings first.')
  const status = parseFrontmatter(text)?.get('status')
  if (status !== 'doing') throw new Error(`the card is ${isStatus(status) ? status : 'not a card'}, and a review needs it in doing.`)

  if (verdict.verdict === 'approve') {
    const edits = statusEdits('doing', 'done', false)!
    return applyStampedEdits(appendNote(text, noteLine(`Approved by ${you}.`, undefined, now)), edits, today(now))
  }

  const comment = verdict.comment.trim()
  const edits: Edit[] = [{ op: 'remove', key: 'owner' }]
  const note = comment === '' ? `Sent back by ${you}.` : `Sent back by ${you}: ${comment}`
  return applyStampedEdits(appendNote(text, noteLine(note, undefined, now)), edits, today(now))
}
