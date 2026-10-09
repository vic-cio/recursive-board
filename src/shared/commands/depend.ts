/**
 * `wi depend` — add or remove one dependency on a card (docs/adr/0041-card-dependencies.md).
 *
 * It writes one list on one file, the card that waits. The card it waits on is never touched.
 */
import { editItem } from '../edit-item.ts'
import { dependencyEditIn, dependencyPath } from '../dependencies.ts'
import { dependenciesOf, titleOf } from '../item-dependencies.ts'
import type { Vault, WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { refOf } from './options.ts'
import { json, label } from './output.ts'

export interface DependChange {
  item: WorkItem
  on: WorkItem | undefined
  onRef: string
  added: boolean
  changed: boolean
}

export async function setDependency(vault: Vault, ref: string, onRef: string, add: boolean): Promise<DependChange> {
  const item = vault.resolve(ref)
  let on: WorkItem | undefined
  try {
    on = vault.resolve(onRef)
  } catch (error) {
    if (add || !(error instanceof Error) || !error.message.startsWith('no work item matches')) throw error
  }
  if (add && on === undefined) throw new Error(`no work item matches "${onRef}".`)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root waits on nothing.`)
  if (item.area) throw new Error(`${item.relPath} is an area. An area is ongoing, so it waits on nothing. Add the dependency to a card in it.`)
  if (add) {
    if (on === undefined) throw new Error(`no work item matches "${onRef}".`)
    if (on === item) throw new Error(`${item.relPath} cannot wait on itself.`)
    if (on.parent === null) throw new Error(`${on.relPath} is a root, and a root is never done. Wait on a card instead.`)
    const path = dependencyPath(on, item, (node) => dependenciesOf(vault, node).resolved)
    if (path) {
      throw new Error(`${titleOf(on)} already waits on ${titleOf(item)} (${path.map(titleOf).join(' → ')}). ` +
        'Cards that wait on each other can never start.')
    }
  }
  // The list is edited as the file holds it under the lock, so an entry another process added
  // since the load survives (docs/adr/0054-edits-from-the-file-at-write-time.md). A target that no
  // longer resolves is matched by its link text, so a broken entry can be removed.
  const target = on?.stem ?? onRef.trim().replace(/\.md$/i, '')
  const names = (linkTarget: string) =>
    on !== undefined ? vault.resolveLink(linkTarget) === on : linkTarget.toLowerCase() === target.toLowerCase()
  let changed = false
  await editItem(vault, item, (text) => {
    const edit = dependencyEditIn(text, target, add, names)
    changed = edit !== null
    return edit === null ? null : [edit]
  })
  return { item, on, onRef, added: add, changed }
}

/** `wi depend <ref> --on <ref> [--off]`. */
export const runDepend: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  const on = typeof line.values['on'] === 'string' ? line.values['on'].trim() : ''
  if (ref === '' || on === '') throw new UsageError('wi depend needs a <ref> and --on <ref>. Add --off to remove the dependency.')
  const change = await setDependency(await context.vault(), ref, on, line.values['off'] !== true)
  const target = change.on ? titleOf(change.on) : change.onRef
  if (line.values['json'] === true) {
    context.out(json({ id: change.item.id, path: change.item.relPath, on: change.on?.id ?? change.on?.stem ?? change.onRef, added: change.added, changed: change.changed }))
  } else if (!change.changed) {
    context.out(`${label(change.item)} ${change.added ? 'already waits' : 'does not wait'} on ${target}. Nothing written.\n`)
  } else {
    context.out(`${label(change.item)}  ${change.added ? 'waits on' : 'no longer waits on'} ${target}\n`)
  }
  return 0
}
