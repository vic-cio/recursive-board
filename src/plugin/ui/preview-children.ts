import type { WorkItemMeta } from '../index.ts'

type Child = Pick<WorkItemMeta, 'status' | 'effectiveArchived'>

/**
 * An expanded card previews what is still live. Done children fold into a count, because the
 * board's Done column holds the history. Open children are never capped: a long backlog on a
 * card is a prompt to deal with it, not clutter to hide.
 */
export function previewChildren<T extends Child>(
  children: T[],
  showArchived: boolean,
): { open: T[]; doneCount: number } {
  const done = children.filter((child) => child.status === 'done')
  return {
    open: children.filter((child) => child.status !== 'done'),
    doneCount: done.filter((child) => showArchived || !child.effectiveArchived).length,
  }
}
