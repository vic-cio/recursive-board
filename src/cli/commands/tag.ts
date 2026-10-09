/**
 * `wi tag` — add or remove one free tag on a card (docs/adr/0057-free-tags.md).
 *
 * Old area tags are reserved, so this refuses changes to them.
 * The tags are edited as the file holds them under the lock, so a tag added since the load stays.
 */
import { editItem } from '../../shared/edit-item.ts'
import { freeTag, freeTagEditsIn } from '../../shared/tags.ts'
import type { Vault, WorkItem } from '../../shared/vault.ts'

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
  await editItem(vault, item, (text) => {
    const edits = freeTagEditsIn(text, tag, add)
    changed = edits !== null
    return edits
  })
  return { item, tag, added: add, changed }
}
