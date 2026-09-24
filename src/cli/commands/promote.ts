/** `wi promote` and `wi demote`: toggle whether an item renders as a board. */
import { boardEdits } from '../../shared/transitions.ts'
import { editItem } from '../write.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface PromotionChange {
  item: WorkItem
  promoted: boolean
  changed: boolean
}

export async function setPromoted(vault: Vault, ref: string, promoted: boolean): Promise<PromotionChange> {
  const item = vault.resolve(ref)
  if (item.board === promoted) return { item, promoted, changed: false }
  await editItem(item, boardEdits(promoted))
  return { item, promoted, changed: true }
}
