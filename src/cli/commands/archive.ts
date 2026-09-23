/** `wi archive`: one file changes; descendants inherit visibility when read. */
import { archiveEdits, activeDescendant } from '../../shared/archive.ts'
import { editItem } from '../write.ts'
import { requireAccountedTree, type Vault, type WorkItem } from '../vault.ts'

export interface ArchiveChange {
  item: WorkItem
  archived: boolean
  changed: boolean
}

export async function archiveItem(vault: Vault, ref: string, undo: boolean): Promise<ArchiveChange> {
  const item = vault.resolve(ref)
  const archived = !undo
  requireAccountedTree(vault, `${archived ? 'archive' : 'unarchive'} ${item.title ?? item.stem}`)
  const edits = archiveEdits(item.archived, archived)
  if (edits === null) return { item, archived, changed: false }

  if (archived) {
    const active = activeDescendant(item, vault.childrenOf, (child) => child.status)
    if (active) {
      throw new Error(`cannot archive ${item.title ?? item.stem}: descendant ${active.title ?? active.stem} (${active.id ?? active.relPath}) is doing.`)
    }
  }
  await editItem(item, edits)
  return { item, archived, changed: true }
}
