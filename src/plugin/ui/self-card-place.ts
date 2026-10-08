import type { Status } from '../../shared/schema.ts'
import type { WorkItemMeta } from '../index.ts'

type Board = Pick<WorkItemMeta, 'area' | 'status' | 'parentLink' | 'effectiveArchived'>

/**
 * The column an area's self-card sits in, or null when the board shows none
 * (docs/adr/0074-an-area-shows-itself-in-its-own-board.md).
 *
 * Areas only, so a promoted card and a root show none. The self-card obeys the archive filter
 * like any card, so an archived area hides it until archived items show.
 */
export function selfCardColumn(board: Board, showArchived: boolean): Status | null {
  if (!board.area || board.parentLink === null || board.status === undefined) return null
  if (board.effectiveArchived && !showArchived) return null
  return board.status
}

/**
 * The self-card's expansion key. The area's own path would also expand the area's card on its
 * parent board, when that board is open in another pane.
 */
export function selfCardKey(path: string): string {
  return `${path}#self`
}

interface Rect {
  left: number
  top: number
  width: number
}

/**
 * Where the board starts its zoom: shrunk into the self-card's place, so that it grows out of the
 * card and lands on itself. One scale for both axes, so the board is never stretched.
 */
export function zoomStart(card: Rect, board: Rect): { x: number; y: number; scale: number } {
  if (board.width <= 0) return { x: 0, y: 0, scale: 1 }
  return { x: card.left - board.left, y: card.top - board.top, scale: card.width / board.width }
}
