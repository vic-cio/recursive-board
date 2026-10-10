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
import { cardState } from './card-state.ts'
import { clearPersonWaitsEdit, dependsOnRaw } from './dependencies.ts'
import { holds, isAnyAgent, sameName, setAssigneesEdits } from './assignee.ts'
import { formatWikilink, type Status } from './schema.ts'

/**
 * Moving a card between columns, including the recorded previous status for `done`.
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
 * `statusEdits` for the card as its text is now. A move to done also clears the card's person
 * waits, which is how a person approves a review (docs/adr/0082-review-is-a-wait-on-a-person.md).
 * `isPerson` says whether a `depends_on` link target names a person note.
 */
export function statusEditsIn(
  text: string, to: Status, isPerson?: (linkTarget: string) => boolean,
): Edit[] | null {
  const state = cardState(text)
  const edits = statusEdits(state.status, to, state.hasPrevStatus)
  if (edits === null || to !== 'done' || isPerson === undefined) return edits
  const clear = clearPersonWaitsEdit(dependsOnRaw(text), isPerson)
  return clear === null ? edits : [...edits, clear]
}

/** Unticking the card as its text is now. A card that is no longer done is left alone. */
export function untickEditsIn(text: string): Edit[] | null {
  const state = cardState(text)
  if (state.status !== 'done') return null
  return statusEdits(state.status, untickTarget(state.prevStatus), state.hasPrevStatus)
}

/**
 * A claim is one status transition and one assignee edit on the same card
 * (docs/adr/0083-assign-and-several-holders.md). A claim starts a card that has no assignee, that asks
 * for any agent, or that lists the claimant already. Any other card needs the claimant assigned
 * first, so two workers that find one card in `wi ready` cannot both take it. The claimant's name
 * replaces the reserved assignee `agent`, and the other assignees stay.
 * `hasOtherDoingChild` is a child in doing that someone other than this agent works: a person, or
 * another agent. A child this agent is assigned to does not block, so an agent can be assigned to a card and the
 * subtask it works now, in either order.
 */
export function claimEdits(
  from: Status | undefined,
  assignees: readonly string[],
  agent: string,
  hasPrevStatus: boolean,
  hasOtherDoingChild: boolean,
): Edit[] | null {
  if (isAnyAgent(agent)) throw new Error('agent is reserved: it means any agent. Claim with your own name.')
  if (from === 'done') throw new Error('a done card cannot be claimed.')
  const listed = holds(assignees, agent)
  const request = assignees.findIndex((name) => isAnyAgent(name))
  if (!listed && request === -1 && assignees.length > 0) {
    throw new Error(`already assigned to ${assignees.join(', ')}. To add an agent, an assignee runs wi assign <ref> --to agent first.`)
  }
  if (listed && from === 'doing') return null
  if (hasOtherDoingChild) {
    throw new Error('this board has a child in doing that another agent or a person works. Release or finish that child first.')
  }
  const status = statusEdits(from, 'doing', hasPrevStatus)
  if (listed) return status
  const next = assignees.length === 0 ? [agent] : assignees.map((name, i) => i === request ? agent : name)
  return [...(status ?? []), ...setAssigneesEdits(next)]
}

/**
 * A release removes one assignee. The status stays while a named assignee remains. When none
 * remains, the card moves to options, with the normal status history rules, so another worker
 * can take it.
 */
export function releaseEdits(from: Status | undefined, assignees: readonly string[], name: string, hasPrevStatus: boolean): Edit[] {
  if (!holds(assignees, name)) throw new Error(`${name} is not assigned to this card. Its assignees: ${assignees.join(', ') || 'none'}.`)
  const rest = assignees.filter((assignee) => !sameName(assignee, name))
  const status = rest.some((assignee) => !isAnyAgent(assignee)) ? null : statusEdits(from, 'options', hasPrevStatus)
  return [...(status ?? []), ...setAssigneesEdits(rest)]
}

/**
 * Where unticking a done item sends it.
 * `prev_status` is what it was. Its absence means the item arrived at done some other way, and
 * `backlog` is the creation default rather than a guess at intent.
 */
export function untickTarget(prevStatus: Status | undefined): Status {
  return prevStatus ?? 'backlog'
}

/**
 * Promotion and demotion.
 * Demotion deletes the key: absence means not a board, and `board: false` would litter the vault
 * with a key that says nothing.
 */
export function boardEdits(promoted: boolean): Edit[] {
  return promoted
    ? [{ op: 'set', key: 'board', value: true }]
    : [{ op: 'remove', key: 'board' }]
}

export interface FirstChildParent {
  isRoot: boolean
  area: boolean
  /** True when the parent carries a `board` key, set or invalid. */
  hasBoardKey: boolean
  /** Children before the new one, archived ones included. */
  childCount: number
}

/**
 * Whether giving a parent a new child also promotes the parent (docs/adr/0035-promote-a-parent-on-its-first-child.md).
 * Only the first child promotes. A parent that already has children and no board is a checklist
 * someone chose or demoted, and a later child must not undo that.
 */
export function firstChildPromotion(parent: FirstChildParent, autoPromote: boolean): Edit[] | null {
  if (!autoPromote || parent.isRoot || parent.area || parent.hasBoardKey || parent.childCount > 0) return null
  return boardEdits(true)
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
  parentOf(this: void, key: string): string | null
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
