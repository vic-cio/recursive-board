/** `wi promote` and `wi demote`: toggle whether an item renders as a board. */
import { boardEdits } from '../transitions.ts'
import { isArea } from '../schema.ts'
import { editItem } from '../edit-item.ts'
import { cardState } from '../card-state.ts'
import type { Vault, WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { refOf } from './options.ts'
import { json, label } from './output.ts'

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

/** `wi promote` and `wi demote`. */
function promotionRunner(promoted: boolean): RunFunction {
  return async (context, line) => {
    const ref = refOf(line.positionals)
    if (ref === '') throw new UsageError(`wi ${promoted ? 'promote' : 'demote'} needs a <ref>.`)
    const change = await setPromoted(await context.vault(), ref, promoted)
    if (line.values['json'] === true) {
      context.out(json({ id: change.item.id, path: change.item.relPath, promoted: change.promoted, changed: change.changed }))
    } else {
      const verb = promoted ? 'promoted' : 'demoted'
      context.out(`${label(change.item)}  ${change.changed ? verb : `already ${promoted ? 'a board' : 'a card'}; nothing written`}\n`)
    }
    return 0
  }
}

export const runPromote = promotionRunner(true)
export const runDemote = promotionRunner(false)
