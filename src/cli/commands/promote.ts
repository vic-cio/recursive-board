/** `wi promote` and `wi demote`: toggle whether an item renders as a board. */
import { boardEdits } from '../../shared/transitions.ts'
import { isArea } from '../../shared/schema.ts'
import { editItem } from '../../shared/edit-item.ts'
import { cardState } from '../../shared/card-state.ts'
import type { Vault, WorkItem } from '../../shared/vault.ts'

export interface PromotionChange {
  item: WorkItem
  promoted: boolean
  changed: boolean
}

export async function setPromoted(vault: Vault, ref: string, promoted: boolean): Promise<PromotionChange> {
  const item = vault.resolve(ref)
  if (isArea(item.area)) {
    throw new Error(`${item.relPath} is an area and cannot be ${promoted ? 'promoted' : 'demoted'}.`)
  }
  if (item.board === promoted) return { item, promoted, changed: false }
  let changed = false
  await editItem(vault, item, (text) => {
    changed = cardState(text).board !== promoted
    return changed ? boardEdits(promoted) : null
  })
  return { item, promoted, changed }
}
