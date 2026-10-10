/**
 * `wi depend` — add or remove one dependency on a card, or one wait on a person
 * (docs/adr/0041-card-dependencies.md, docs/adr/0082-review-is-a-wait-on-a-person.md).
 *
 * It writes one list on one file, the card that waits. The card or person it waits on is never touched.
 */
import { editItem } from '../edit-item.ts'
import { dependencyEditIn, dependencyPath } from '../dependencies.ts'
import { dependenciesOf, titleOf } from '../item-dependencies.ts'
import { readPeople, type Vault, type WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { refOf } from './options.ts'
import { json, label } from './output.ts'

export interface DependChange {
  item: WorkItem
  on: WorkItem | undefined
  /** The person note's name, when the wait is on a person. */
  person: string | undefined
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
    if (!(error instanceof Error) || !error.message.startsWith('no work item matches')) throw error
  }
  // A name that is no card may be a person: a wait on a person is how a card asks for a review.
  const person = on === undefined ? (await readPeople(vault.port)).get(onRef.trim().replace(/\.md$/i, '').toLowerCase()) : undefined
  if (add && on === undefined && person === undefined) {
    throw new Error(`no work item or person note matches "${onRef}". Try a card id, filename or title, or the name of a note with type: person.`)
  }
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root waits on nothing.`)
  if (item.area) throw new Error(`${item.relPath} is an area. An area is ongoing, so it waits on nothing. Add the dependency to a card in it.`)
  if (add && on !== undefined) {
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
  const target = on?.stem ?? person ?? onRef.trim().replace(/\.md$/i, '')
  const names = (linkTarget: string) =>
    on !== undefined ? vault.resolveLink(linkTarget) === on : linkTarget.toLowerCase() === target.toLowerCase()
  let changed = false
  await editItem(vault, item, (text) => {
    const edit = dependencyEditIn(text, target, add, names)
    changed = edit !== null
    return edit === null ? null : [edit]
  })
  return { item, on, person, onRef, added: add, changed }
}

/** `wi depend <ref> --on <ref> [--off]`. */
export const runDepend: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  const on = typeof line.values['on'] === 'string' ? line.values['on'].trim() : ''
  if (ref === '' || on === '') throw new UsageError('wi depend needs a <ref> and --on <ref or person>. Add --off to remove the dependency.')
  const change = await setDependency(await context.vault(), ref, on, line.values['off'] !== true)
  const target = change.on ? titleOf(change.on) : change.person ?? change.onRef
  if (line.values['json'] === true) {
    context.out(json({ id: change.item.id, path: change.item.relPath, on: change.on?.id ?? change.on?.stem ?? change.person ?? change.onRef, added: change.added, changed: change.changed }))
  } else if (!change.changed) {
    context.out(`${label(change.item)} ${change.added ? 'already waits' : 'does not wait'} on ${target}. Nothing written.\n`)
  } else {
    context.out(`${label(change.item)}  ${change.added ? 'waits on' : 'no longer waits on'} ${target}\n`)
  }
  return 0
}
