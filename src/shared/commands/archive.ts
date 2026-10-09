/** `wi archive`: one file changes; descendants inherit visibility when read. */
import { archiveEdits, activeDescendant } from '../archive.ts'
import { editItem } from '../edit-item.ts'
import { cardState } from '../card-state.ts'
import { requireAccountedTree, type Vault, type WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { refOf } from './options.ts'
import { json, label } from './output.ts'

export interface ArchiveChange {
  item: WorkItem
  archived: boolean
  changed: boolean
}

export async function archiveItem(vault: Vault, ref: string, undo: boolean): Promise<ArchiveChange> {
  const item = vault.resolve(ref)
  const archived = !undo
  requireAccountedTree(vault, `${archived ? 'archive' : 'unarchive'} ${item.title ?? item.stem}`)
  if (archiveEdits(item.archived, archived) === null) return { item, archived, changed: false }

  if (archived) {
    const active = activeDescendant(item, (parent) => vault.childrenOf(parent), (child) => child.status)
    if (active) {
      throw new Error(`cannot archive ${item.title ?? item.stem}: descendant ${active.title ?? active.stem} (${active.id ?? active.relPath}) is doing.`)
    }
  }
  // The flag is read again under the lock, so a second archive of one card reports no change.
  let changed = false
  await editItem(vault, item, (text) => {
    const edits = archiveEdits(cardState(text).archived, archived)
    changed = edits !== null
    return edits
  })
  return { item, archived, changed }
}

/** `wi archive <ref> [--undo]`. */
export const runArchive: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  if (ref === '') throw new UsageError('wi archive needs a <ref>.')
  const change = await archiveItem(await context.vault(), ref, line.values['undo'] === true)
  if (line.values['json'] === true) {
    context.out(json({ id: change.item.id, path: change.item.relPath, archived: change.archived, changed: change.changed }))
  } else {
    const verb = change.archived ? 'archived' : 'unarchived'
    context.out(`${label(change.item)}  ${verb}${change.changed ? '' : ' (already so; nothing written)'}\n`)
  }
  return 0
}
