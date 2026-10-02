/**
 * `wi set` — change who is behind a card: its owner and, once, its creator
 * (docs/adr/0042-creator-and-role.md). One file, one write. A role is a tag now
 * (docs/adr/0062-role-tags.md); `--role ""` only removes an old `role` field.
 *
 * The creator is set once. `wi set` writes it only when the card has none, so a migration can
 * credit old cards, but no later run can rewrite who made one.
 */
import { editItem, type Edit } from '../write.ts'
import { asName, displayName } from '../../shared/authorship.ts'
import { roleTagFor } from '../../shared/role-tags.ts'
import { parseFrontmatter, type Scalar } from '../../shared/frontmatter.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface SetOptions {
  /** A name or link. An empty string removes the owner. */
  owner?: string
  /** Only an empty string, which removes an old `role` field. A role is a tag: `wi tag`. */
  role?: string
  creator?: string
  model?: string
}

export interface SetChange {
  item: WorkItem
  changed: string[]
}

export async function setPeople(vault: Vault, ref: string, options: SetOptions): Promise<SetChange> {
  const item = vault.resolve(ref)
  if (item.parent === null) throw new Error(`${item.relPath} is a root. A root has no owner or creator.`)
  if (options.role !== undefined && options.role.trim() !== '') {
    throw new Error(`a role is a tag now. Run: wi tag ${ref} ${roleTagFor(options.role)}`)
  }
  let changed: string[] = []
  // Decided under the lock, from the card as it is then, so a creator set since the load is never
  // replaced (docs/adr/0054-edits-from-the-file-at-write-time.md).
  await editItem(item, (text) => {
    const fm = parseFrontmatter(text)
    const planned = peopleEdits(item, options, (key) => fm?.get(key))
    changed = planned.changed
    return planned.edits
  })
  return { item, changed }
}

function peopleEdits(
  item: WorkItem, options: SetOptions, current: (key: string) => Scalar | undefined,
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

  if (options.creator !== undefined) {
    const next = asName(options.creator)
    const had = current('creator')
    if (had !== undefined && displayName(had) !== next) {
      throw new Error(`${item.relPath} was made by ${displayName(had)}. A creator is set once and never changes.`)
    }
    // A creator written as a link before names were plain is rewritten as the same name.
    if (had !== next) {
      edits.push({ op: 'set', key: 'creator', value: next })
      changed.push('creator')
    }
  }
  if (options.model !== undefined && options.model.trim() !== '') {
    if (options.creator === undefined && current('creator') === undefined) {
      throw new Error('--model describes the creator. Pass --creator too.')
    }
    const had = current('creator_model')
    if (had !== undefined && had !== options.model.trim()) {
      throw new Error(`${item.relPath} records the model ${String(had)}. It is set with the creator, once.`)
    }
    if (had === undefined) {
      edits.push({ op: 'set', key: 'creator_model', value: options.model.trim() })
      changed.push('creator_model')
    }
  }

  return { edits, changed }
}
