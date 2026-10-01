/**
 * `wi area` — convert a work item between a card and an ongoing area.
 *
 * The operation changes one item's frontmatter. It keeps the body and every unrelated key, and
 * refuses to discard an active claim when converting a card to an area.
 */
import { editItem } from '../write.ts'
import { isStatus, type Status } from '../../shared/schema.ts'
import { cardState } from '../../shared/card-state.ts'
import { areaEdits, areaRefusal, type AreaItemState, type AreaTarget } from '../../shared/area.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface AreaOptions {
  off: boolean
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
  const direction = options.off ? 'card' : 'area'
  // The refusal and the edits read the card as it is under the lock, so a claim made since the
  // load is never discarded (docs/adr/0054-edits-from-the-file-at-write-time.md).
  let status = item.status
  let current = item.text
  const after = await editItem(item, (text) => {
    current = text
    const now = cardState(text)
    const state: AreaItemState = {
      label: item.relPath,
      isRoot: item.parent === null,
      isArea: now.area,
      status: now.status,
      holder: now.holder,
    }
    const refusal = areaRefusal(state, direction)
    if (refusal !== null) throw new Error(refusal)
    if (options.off && !isStatus(now.status)) throw new Error(`${item.relPath} has no valid status to preserve.`)
    status = now.status
    const target: AreaTarget = { kind: direction }
    return areaEdits(state, target)
  })
  return options.off
    ? { item, from: 'area', to: 'card', status, changed: current !== after }
    : { item, from: 'card', to: 'area', status, changed: current !== after }
}
