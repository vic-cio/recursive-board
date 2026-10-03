/**
 * `wi set` — change a card's owner. One file, one write. A role is a tag now
 * (docs/adr/0062-role-tags.md); `--role ""` only removes an old `role` field. Cards no longer record
 * their creator (docs/adr/0063-wi-starts-no-agents.md).
 */
import { editItem, type Edit } from '../write.ts'
import { asName } from '../../shared/authorship.ts'
import { roleTagFor } from '../../shared/role-tags.ts'
import { parseFrontmatter, type Scalar } from '../../shared/frontmatter.ts'
import type { Vault, WorkItem } from '../vault.ts'

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
  await editItem(item, (text) => {
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
