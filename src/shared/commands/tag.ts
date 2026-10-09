/**
 * `wi tag` — add or remove one free tag on a card (docs/adr/0057-free-tags.md).
 *
 * Old area tags are reserved, so this refuses changes to them.
 * The tags are edited as the file holds them under the lock, so a tag added since the load stays.
 */
import { editItem } from '../edit-item.ts'
import { freeTag, freeTagEditsIn } from '../tags.ts'
import type { Vault, WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { json, label } from './output.ts'

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

/** `wi tag <ref> <tag> [--off]`. */
export const runTag: RunFunction = async (context, line) => {
  // A tag holds no space, so the last word is the tag and the words before it are the <ref>.
  const rest = line.positionals.slice(1)
  const tag = rest.length > 1 ? rest[rest.length - 1]! : ''
  const ref = rest.slice(0, -1).join(' ').trim()
  if (ref === '' || tag.trim() === '') {
    throw new UsageError('wi tag needs a <ref> and a <tag>. Try: wi tag wi-a7f3 design. Add --off to remove it.')
  }
  const change = await setTag(await context.vault(), ref, tag, line.values['off'] !== true)
  if (line.values['json'] === true) {
    context.out(json({ id: change.item.id, path: change.item.relPath, tag: change.tag, added: change.added, changed: change.changed }))
  } else if (!change.changed) {
    context.out(`${label(change.item)} ${change.added ? 'already has' : 'has no'} tag ${change.tag}. Nothing written.\n`)
  } else {
    context.out(`${label(change.item)}  ${change.added ? '+' : '-'}${change.tag}\n`)
  }
  return 0
}
