/**
 * `wi set` — change a card's owner. One file, one write. A role is a tag now
 * (docs/adr/0062-role-tags.md); `--role ""` only removes an old `role` field. Cards no longer record
 * their creator (docs/adr/0063-wi-starts-no-agents.md).
 */
import { editItem } from '../edit-item.ts'
import type { Edit } from '../edits.ts'
import { asName } from '../authorship.ts'
import { roleTagFor } from '../role-tags.ts'
import { parseFrontmatter, type Scalar } from '../frontmatter.ts'
import type { Vault, WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { refOf, text } from './options.ts'
import { json, label } from './output.ts'

export interface SetOptions {
  /** A name or link. An empty string removes the owner. */
  owner?: string
  /** Only an empty string, which removes an old `role` field. A role is a tag: `wi tag`. */
  role?: string
}

export interface SetChange {
  item: WorkItem
  changed: string[]
}

export async function setPeople(vault: Vault, ref: string, options: SetOptions): Promise<SetChange> {
  const item = vault.resolve(ref)
  if (item.parent === null) throw new Error(`${item.relPath} is a root. A root has no owner.`)
  if (options.role !== undefined && options.role.trim() !== '') {
    throw new Error(`a role is a tag now. Run: wi tag ${ref} ${roleTagFor(options.role)}`)
  }
  let changed: string[] = []
  // Decided under the lock, from the card as it is then (docs/adr/0054-edits-from-the-file-at-write-time.md).
  await editItem(vault, item, (text) => {
    const fm = parseFrontmatter(text)
    const planned = peopleEdits(options, (key) => fm?.get(key))
    changed = planned.changed
    return planned.edits
  })
  return { item, changed }
}

function peopleEdits(
  options: SetOptions, current: (key: string) => Scalar | undefined,
): { edits: Edit[]; changed: string[] } {
  const edits: Edit[] = []
  const changed: string[] = []

  const assign = (key: 'owner' | 'role', value: string | undefined) => {
    // An empty --role arrives here only to remove an old field; a named role was refused above.
    if (value === undefined) return
    if (value.trim() === '') {
      if (current(key) !== undefined) {
        edits.push({ op: 'remove', key })
        changed.push(key)
      }
      return
    }
    const next = asName(value)
    if (current(key) !== next) {
      edits.push({ op: 'set', key, value: next })
      changed.push(key)
    }
  }
  assign('owner', options.owner)
  assign('role', options.role)


  return { edits, changed }
}

/** `wi set <ref> --owner <name>`, or `--role ""` to remove an old role field. */
export const runSet: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  const owner = text(line.values, 'owner')
  const role = text(line.values, 'role')
  const options: SetOptions = { ...(owner === undefined ? {} : { owner }), ...(role === undefined ? {} : { role }) }
  if (ref === '' || Object.keys(options).length === 0) {
    throw new UsageError('wi set needs a <ref> and --owner, or --role "" to remove an old role field.')
  }
  const change = await setPeople(await context.vault(), ref, options)
  if (line.values['json'] === true) context.out(json({ id: change.item.id, path: change.item.relPath, changed: change.changed }))
  else context.out(change.changed.length > 0
    ? `${label(change.item)}  set ${change.changed.join(', ')}\n`
    : `${label(change.item)}  already so. Nothing written.\n`)
  return 0
}
