/**
 * `wi area` — convert a work item between a card and an ongoing area.
 *
 * The operation changes one item's frontmatter. It keeps the body and every unrelated key, and
 * refuses to discard an active claim or in-progress status when converting a card to an area.
 */
import { editItem } from '../write.ts'
import { isStatus, STATUSES, type Status } from '../../shared/schema.ts'
import { areaEdits, areaRefusal, type AreaItemState, type AreaTarget } from '../../shared/area.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface AreaOptions {
  off: boolean
  status?: string
}

export interface AreaChange {
  item: WorkItem
  from: 'card' | 'area'
  to: 'card' | 'area'
  status: Status | undefined
  changed: boolean
}

export async function setArea(vault: Vault, ref: string, options: AreaOptions): Promise<AreaChange> {
  const item = vault.resolve(ref)
  const agent = item.frontmatter.get('agent')
  const state: AreaItemState = {
    label: item.relPath,
    isRoot: item.parent === null,
    isArea: item.area,
    status: item.status,
    agent: typeof agent === 'string' ? agent : undefined,
  }
  const direction = options.off ? 'card' : 'area'
  const refusal = areaRefusal(state, direction)
  if (refusal !== null) throw new Error(refusal)

  if (options.off) {
    if (options.status === undefined) {
      throw new Error('converting an area back to a card needs --status <status>.')
    }
    if (!isStatus(options.status)) {
      throw new Error(`"${options.status}" is not a status. Use one of: ${STATUSES.join(', ')}.`)
    }
    const target: AreaTarget = { kind: 'card', status: options.status }
    const edits = areaEdits(state, target)
    const before = item.text
    const after = await editItem(item, edits)
    return { item, from: 'area', to: 'card', status: options.status, changed: before !== after }
  }

  if (options.status !== undefined) {
    throw new Error('--status applies only when converting an area back with --off.')
  }
  const edits = areaEdits(state, { kind: 'area' })
  const before = item.text
  const after = await editItem(item, edits)
  return { item, from: 'card', to: 'area', status: undefined, changed: before !== after }
}
