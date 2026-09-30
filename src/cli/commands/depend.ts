/**
 * `wi depend` — add or remove one dependency on a card (docs/adr/0041-card-dependencies.md).
 *
 * It writes one list on one file, the card that waits. The card it waits on is never touched.
 */
import { editItem } from '../write.ts'
import { dependencyEditIn, dependencyPath } from '../../shared/dependencies.ts'
import { dependenciesOf, titleOf } from '../dependencies.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface DependChange {
  item: WorkItem
  on: WorkItem
  added: boolean
  changed: boolean
}

export async function setDependency(vault: Vault, ref: string, onRef: string, add: boolean): Promise<DependChange> {
  const item = vault.resolve(ref)
  const on = vault.resolve(onRef)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root waits on nothing.`)
  if (item.area) throw new Error(`${item.relPath} is an area. An area is ongoing, so it waits on nothing. Add the dependency to a card in it.`)
  if (add) {
    if (on === item) throw new Error(`${item.relPath} cannot wait on itself.`)
    if (on.parent === null) throw new Error(`${on.relPath} is a root, and a root is never done. Wait on a card instead.`)
    const path = dependencyPath(on, item, (node) => dependenciesOf(vault, node).resolved)
    if (path) {
      throw new Error(`${titleOf(on)} already waits on ${titleOf(item)} (${path.map(titleOf).join(' → ')}). ` +
        'Cards that wait on each other can never start.')
    }
  }
  // The list is edited as the file holds it under the lock, so an entry another process added
  // since the load survives (docs/adr/0053-edits-from-the-file-at-write-time.md).
  let changed = false
  await editItem(item, (text) => {
    const edit = dependencyEditIn(text, on.stem, add, (target) => vault.resolveLink(target) === on)
    changed = edit !== null
    return edit === null ? null : [edit]
  })
  return { item, on, added: add, changed }
}
