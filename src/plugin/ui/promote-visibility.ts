import type { WorkItemMeta } from '../index.ts'

/** A child can be promoted before it has children of its own. */
export function shouldRenderPromoteToggle(options: {
  meta: Pick<WorkItemMeta, 'parentLink' | 'board' | 'area'>
  childCount: number
}): boolean {
  const { meta, childCount } = options
  return !meta.area && (meta.parentLink !== null || childCount > 0 || meta.board)
}
