import { opensAsBoard, type WorkItemMeta } from '../index.ts'

type MoveTarget = Pick<WorkItemMeta, 'title' | 'board' | 'area'>

/** Boards and areas first, because a board is where a card is usually moved to; then by title. */
export function compareMoveTargets(a: MoveTarget, b: MoveTarget): number {
  return Number(opensAsBoard(b)) - Number(opensAsBoard(a)) || a.title.localeCompare(b.title)
}
