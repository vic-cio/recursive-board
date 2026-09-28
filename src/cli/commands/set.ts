/**
 * `wi set` — change who is behind a card: its owner, its role, and, once, its creator
 * (docs/adr/0042-creator-and-role.md). One file, one write.
 *
 * The creator is set once. `wi set` writes it only when the card has none, so a migration can
 * credit old cards, but no later run can rewrite who made one.
 */
import { editItem, type Edit } from '../write.ts'
import { asLink, displayName } from '../../shared/authorship.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface SetOptions {
  /** A name or link. An empty string removes the owner. */
  owner?: string
  /** A name or link. An empty string removes the role. */
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
  if (item.parent === null) throw new Error(`${item.relPath} is a root. A root has no owner, role or creator.`)
  const edits: Edit[] = []
  const changed: string[] = []
  const current = (key: string) => item.frontmatter.get(key)

  const assign = async (key: 'owner' | 'role', value: string | undefined) => {
    if (value === undefined) return
    if (value.trim() === '') {
      if (current(key) !== undefined) {
        edits.push({ op: 'remove', key })
        changed.push(key)
      }
      return
    }
    // An owner stays plain text when no note has that name, as wi new writes it.
    const next = key === 'owner' && await vault.resolveNote(displayName(value)!) === undefined ? value.trim() : asLink(value)
    if (current(key) !== next) {
      edits.push({ op: 'set', key, value: next })
      changed.push(key)
    }
  }
  await assign('owner', options.owner)
  await assign('role', options.role)

  if (options.creator !== undefined) {
    const next = asLink(options.creator)
    const had = current('creator')
    if (had !== undefined && had !== next) {
      throw new Error(`${item.relPath} was made by ${displayName(had)}. A creator is set once and never changes.`)
    }
    if (had === undefined) {
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

  if (edits.length > 0) await editItem(item, edits)
  return { item, changed }
}
