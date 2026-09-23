/**
 * What a board interaction does to a work item's frontmatter.
 *
 * These are the rules the CLI and the plugin must agree on exactly, because a card ticked on the
 * phone and a card moved by an agent are the same operation. Keeping them here means the rule is
 * tested once and cannot drift between the two writers.
 *
 * Every transition touches one file. That is what makes a card move safe on a synced vault
 * (spec section 37), so nothing here may produce an edit to a parent.
 */
import type { Edit } from './edits.ts'
import { formatWikilink, type Status } from './schema.ts'

/**
 * Moving a card between columns, including decision U2's rule for `done`.
 * Returns null when the move is a no-op, so a caller can avoid a pointless sync event.
 */
export function statusEdits(
  from: Status | undefined,
  to: Status,
  hasPrevStatus: boolean,
): Edit[] | null {
  if (from === to) return null

  const edits: Edit[] = [{ op: 'set', key: 'status', value: to }]
  if (to === 'done') {
    // Record what it was, so unticking restores it exactly rather than guessing at backlog.
    if (from !== undefined) edits.push({ op: 'set', key: 'prev_status', value: from })
  } else if (hasPrevStatus) {
    // Leaving done: the record has served its purpose and would only go stale.
    edits.push({ op: 'remove', key: 'prev_status' })
  }
  return edits
}

/**
 * Where unticking a done item sends it (decision U2).
 * `prev_status` is what it was. Its absence means the item arrived at done some other way, and
 * `backlog` is the creation default rather than a guess at intent.
 */
export function untickTarget(prevStatus: Status | undefined): Status {
  return prevStatus ?? 'backlog'
}

/**
 * Promotion and demotion (decision U3).
 * Demotion deletes the key: absence means not a board, and `board: false` would litter the vault
 * with a key that says nothing.
 */
export function boardEdits(promoted: boolean): Edit[] {
  return promoted
    ? [{ op: 'set', key: 'board', value: true }]
    : [{ op: 'remove', key: 'board' }]
}

/**
 * Reparenting: moving an item to another board.
 *
 * It rewrites the child's `parent` and nothing else. The status stays, because a move changes
 * where an item sits and not how far along it is, and the item's own children follow it for
 * free because they point at it by link. Returns null when the target is already the parent.
 * Stems compare without case, because Obsidian resolves a wikilink that way.
 */
export function moveEdits(currentParentStem: string | null, targetStem: string): Edit[] | null {
  if (currentParentStem !== null && currentParentStem.toLowerCase() === targetStem.toLowerCase()) {
    return null
  }
  return [{ op: 'set', key: 'parent', value: formatWikilink(targetStem) }]
}

export interface MoveCheck {
  /** The item being moved, as a key the caller's index uses. */
  item: string
  /** The proposed new parent, keyed the same way. */
  target: string
  /**
   * True when the item has no `parent` at all. Stated rather than derived from `parentOf`,
   * because an orphan also has no resolved parent, and moving an orphan is how it is repaired.
   */
  isRoot: boolean
  /** The parent of a key, or null for a root or an orphan. */
  parentOf(key: string): string | null
}

/**
 * Why a move must not happen, or null when it may.
 *
 * A root has no parent to change. A move under the item itself or under one of its descendants
 * would make the parent chain loop, and the whole subtree would then render on no board. The
 * walk carries a seen set, so a vault whose chain already loops cannot hang it (integrity rule 3).
 */
export function moveRefusal(check: MoveCheck): string | null {
  const { item, target, isRoot, parentOf } = check
  if (isRoot) {
    return 'it is a root, and a root has no parent to change.'
  }
  if (item === target) return 'an item cannot be moved under itself.'

  const seen = new Set<string>()
  for (let key: string | null = target; key !== null; key = parentOf(key)) {
    if (key === item) return 'the target is under its own subtree, so the move would make a loop.'
    if (seen.has(key)) break
    seen.add(key)
  }
  return null
}
