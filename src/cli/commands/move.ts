/**
 * `wi move` — move a work item to another board.
 *
 * `parent` is the field the whole model turns on, and this is the one command that changes it.
 * It touches exactly one file, the moved item: the old parent and the new parent hold no record
 * of their children, so neither is written. The item's own children follow it for free, because
 * they point at it by link.
 *
 * The rules are in `shared/transitions.ts`, so the plugin's "Move to…" does the same thing.
 */
import { editItem } from '../write.ts'
import { moveEdits, moveRefusal } from '../../shared/transitions.ts'
import { requireWholeTree, type Vault, type WorkItem } from '../vault.ts'

export interface MoveResult {
  item: WorkItem
  /** The old parent's wikilink target, or null when the item had none. */
  from: string | null
  to: WorkItem
  changed: boolean
}

export async function moveItem(vault: Vault, ref: string, targetRef: string): Promise<MoveResult> {
  const item = vault.resolve(ref)
  const target = vault.resolve(targetRef)
  requireWholeTree(vault, `move ${item.title ?? item.stem}`)

  // Keyed by stem, lowercased: the key a wikilink resolves by.
  const key = (w: WorkItem) => w.stem.toLowerCase()
  const byKey = new Map(vault.items.map((w) => [key(w), w]))
  const refusal = moveRefusal({
    item: key(item),
    target: key(target),
    isRoot: item.parent === null,
    parentOf: (k) => {
      const parent = vault.resolveLink(byKey.get(k)?.parent ?? null)
      return parent ? key(parent) : null
    },
  })
  if (refusal !== null) {
    throw new Error(`cannot move ${item.title ?? item.stem} under ${target.title ?? target.stem}: ${refusal}`)
  }

  const edits = moveEdits(item.parent, target.stem)
  if (edits === null) return { item, from: item.parent, to: target, changed: false }

  await editItem(item, edits)
  return { item, from: item.parent, to: target, changed: true }
}
