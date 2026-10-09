/**
 * Send a card for review, and give the verdict, with the shared edits the plugin uses
 * (docs/adr/0043-review-verdicts.md, docs/adr/0065-review-verdicts-in-wi.md).
 */
import { applyReviewRequest, applyVerdict, type Verdict } from '../review.ts'
import type { Status } from '../schema.ts'
import { readPeople, type Vault, type WorkItem } from '../vault.ts'
import { editItem } from '../edit-item.ts'
import { readyParent, unblockedBy } from './status.ts'
import { authorLabel } from '../authorship.ts'
import { UsageError, type CommandContext, type RunFunction } from './command.ts'
import { envText, refOf, singleLineOption } from './options.ts'
import { json, label } from './output.ts'

export interface ReviewRequest {
  item: WorkItem
  to: string
  files: string[]
}

export async function sendForReview(
  vault: Vault, ref: string, to: string, files: string[] = [], note = '', writer?: string, now: Date = vault.seams.now(),
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
export async function giveVerdict(vault: Vault, ref: string, verdict: Verdict, now: Date = vault.seams.now()): Promise<VerdictResult> {
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

function writerOf(context: CommandContext): string | undefined {
  return authorLabel(envText(context, 'WI_AGENT'), envText(context, 'WI_MODEL'))
}

/** `wi review <ref> --to <name> [--files <path>]... [--note <text>]`. */
export const runReview: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  if (ref === '') throw new UsageError('wi review needs a <ref> and --to <name>.')
  const to = singleLineOption(line.values, 'to')
  const rawFiles = line.values['files']
  const files: string[] = typeof rawFiles === 'string'
    ? [rawFiles]
    : Array.isArray(rawFiles) ? rawFiles.filter((file): file is string => typeof file === 'string') : []
  if (files.some((file) => file.trim() === '' || /[\r\n]/.test(file))) {
    throw new UsageError('--files needs a non-empty, one-line path.')
  }
  const note = line.values['note'] === undefined ? '' : String(line.values['note'])
  const result = await sendForReview(await context.vault(), ref, to, files, note, writerOf(context))
  if (line.values['json'] === true) context.out(json({ id: result.item.id ?? null, path: result.item.relPath, owner: result.to, files: result.files }))
  else context.out(`${label(result.item)}  sent to ${result.to} for review` +
    `${result.files.length ? `  (${result.files.join(', ')})` : ''}\n`)
  return 0
}

/** `wi approve` and `wi send-back`: the verdict of the reviewer the card's owner names. */
function verdictRunner(command: 'approve' | 'send-back'): RunFunction {
  return async (context, line) => {
    const ref = refOf(line.positionals)
    if (ref === '' || line.values['you'] === undefined) throw new UsageError(`wi ${command} needs a <ref> and --you <name>, the reviewer the card's owner names.`)
    const you = singleLineOption(line.values, 'you')
    const writer = writerOf(context)
    const signed = writer === undefined ? {} : { writer }
    let comment = ''
    if (line.values['comment'] !== undefined) {
      comment = String(line.values['comment'])
      if (/[\r\n]/.test(comment)) throw new UsageError('--comment must be one line.')
    }
    const verdict = command === 'approve'
      ? { verdict: 'approve' as const, you, ...signed }
      : { verdict: 'send back' as const, you, comment, ...signed }
    const result = await giveVerdict(await context.vault(), ref, verdict)
    if (line.values['json'] === true) {
      context.out(json({
        id: result.item.id ?? null, path: result.item.relPath, verdict: verdict.verdict, you, status: result.status,
        parent_ready: result.parentReady?.id ?? null, unblocked: result.unblocked.map((item) => item.id ?? item.stem),
      }))
      return 0
    }
    if (command === 'approve') context.out(`${label(result.item)}  approved by ${you}  doing → done\n`)
    else context.out(`${label(result.item)}  sent back by ${you}  (owner removed; it stays in doing)\n`)
    for (const item of result.unblocked) context.out(`${label(item)}  waits on nothing open now. It can start.\n`)
    const ready = result.parentReady
    if (ready) {
      context.out(`${label(ready)}  every child is done. If its own criteria are met, run: ` +
        `wi status ${ready.id ?? ready.stem} done\n`)
    }
    return 0
  }
}

export const runApprove = verdictRunner('approve')
export const runSendBack = verdictRunner('send-back')
