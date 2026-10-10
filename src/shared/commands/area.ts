/**
 * `wi area` — convert a work item between a card and an ongoing area.
 *
 * The operation changes one item's frontmatter. It keeps the body and every unrelated key, and
 * refuses to discard an active claim when converting a card to an area.
 */
import { editItem } from '../edit-item.ts'
import { isStatus, type Status } from '../schema.ts'
import { cardState } from '../card-state.ts'
import { areaEdits, areaRefusal, type AreaItemState, type AreaTarget } from '../area.ts'
import type { Vault, WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { refOf } from './options.ts'
import { json, label } from './output.ts'

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
  const after = await editItem(vault, item, (text) => {
    current = text
    const now = cardState(text)
    const state: AreaItemState = {
      label: item.relPath,
      isRoot: item.parent === null,
      isArea: now.area,
      status: now.status,
      holders: now.holders,
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

/** `wi area <ref> [--off]`. */
export const runArea: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  if (ref === '') {
    throw new UsageError('wi area needs a <ref>. Use --off to convert an area back to a card.')
  }
  const change = await setArea(await context.vault(), ref, {
    off: line.values['off'] === true,
  })
  if (line.values['json'] === true) {
    context.out(json({
      id: change.item.id,
      path: change.item.relPath,
      from: change.from,
      to: change.to,
      status: change.status ?? null,
      changed: change.changed,
    }))
  } else {
    context.out(`${label(change.item)}  ${change.from} → ${change.to}` +
      `${change.status ? `  (status: ${change.status})` : ''}\n`)
  }
  return 0
}
