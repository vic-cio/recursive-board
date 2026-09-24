/** The fields the shared card/area conversion rule needs from either writer. */
import type { Edit } from './edits.ts'
import type { Status } from './schema.ts'

export interface AreaItemState {
  label: string
  isRoot: boolean
  isArea: boolean
  status: Status | undefined
  agent: string | undefined
}

export type AreaTarget =
  | { kind: 'area' }
  | { kind: 'card'; status: Status }

/** Why a conversion is not allowed, or null when the requested direction is valid. */
export function areaRefusal(item: AreaItemState, direction: AreaTarget['kind']): string | null {
  if (item.isRoot) return `${item.label} is a root, and a root is not a card or area child.`

  if (direction === 'card') {
    if (!item.isArea) return `${item.label} is not an area. Nothing to convert back to a card.`
    return null
  }

  if (item.isArea) return `${item.label} is already an area.`
  if (item.agent !== undefined && item.agent.trim() !== '') {
    return `${item.label} has agent "${item.agent}". Release it before converting it to an area.`
  }
  return null
}

/** The frontmatter edits for an allowed conversion. All unrelated lines remain untouched. */
export function areaEdits(item: AreaItemState, target: AreaTarget): Edit[] {
  const refusal = areaRefusal(item, target.kind)
  if (refusal !== null) throw new Error(refusal)

  if (target.kind === 'area') {
    return [
      { op: 'set', key: 'area', value: true },
      { op: 'remove', key: 'prev_status' },
    ]
  }

  return [
    { op: 'remove', key: 'area' },
    { op: 'set', key: 'status', value: target.status },
    { op: 'remove', key: 'prev_status' },
  ]
}
