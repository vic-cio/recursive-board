/**
 * `wi tag` — add or remove one free tag on a card (docs/adr/free-tags.md).
 *
 * The area tag is not a free tag: the tree sets it and `wi retag` writes it, so this refuses one.
 * The tags are edited as the file holds them under the lock, so a tag added since the load stays.
 */
import { editItem } from '../write.ts'
import { freeTag, freeTagEditsIn } from '../../shared/tags.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface TagChange {
  item: WorkItem
  tag: string
  added: boolean
  changed: boolean
}

export async function setTag(vault: Vault, ref: string, input: string, add: boolean): Promise<TagChange> {
  const tag = freeTag(input)
  const item = vault.resolve(ref)
  let changed = false
  await editItem(item, (text) => {
    const edits = freeTagEditsIn(text, tag, add)
    changed = edits !== null
    return edits
  })
  return { item, tag, added: add, changed }
}
