/**
 * Role tags (docs/adr/0062-role-tags.md). A role is a free tag under `role/`, such as
 * `role/checker`. A note that is not a work item and carries the same tag is that role's
 * procedure. Nothing inherits, and nothing here is required: a card with no role tag is fine.
 *
 * This module imports nothing from Node.
 */
import { freeTag } from './tags.ts'

export const ROLE_TAG_PREFIX = 'role/'

/** The tag as it compares: no `#`, lower case, as Obsidian matches tags. */
export function roleTagKey(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase()
}

export function isRoleTag(tag: string): boolean {
  const key = roleTagKey(tag)
  return key.startsWith(ROLE_TAG_PREFIX) && key.length > ROLE_TAG_PREFIX.length
}

/** The role tags in a tag list, in list order, each once, as written but without `#`. */
export function roleTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const found: string[] = []
  for (const tag of tags) {
    if (!isRoleTag(tag) || seen.has(roleTagKey(tag))) continue
    seen.add(roleTagKey(tag))
    found.push(tag.trim().replace(/^#/, ''))
  }
  return found
}

/**
 * The role tag for a role name: `Takeoff agent` is `role/takeoff-agent`. A name already written as
 * a role tag (`role/checker`, `#role/checker`) is kept. Throws for text that makes no tag.
 */
export function roleTagFor(name: string): string {
  const trimmed = name.trim().replace(/^#/, '')
  if (trimmed === '') throw new Error('a role needs a name.')
  if (isRoleTag(trimmed)) return freeTag(trimmed)
  return freeTag(`${ROLE_TAG_PREFIX}${trimmed.toLowerCase().replace(/\s+/g, '-')}`)
}

/** A note as the role lookup sees it. */
export interface TaggedNote {
  path: string
  tags: readonly string[]
  /** A work item carries role tags as a user of the role, never as its procedure. */
  workItem: boolean
}

/** The procedure notes for one role tag: every note that is not a work item and carries it. */
export function procedureNotes(tag: string, notes: readonly TaggedNote[]): string[] {
  const key = roleTagKey(tag)
  return notes
    .filter((note) => !note.workItem && note.tags.some((other) => roleTagKey(other) === key))
    .map((note) => note.path)
    .sort()
}

/**
 * Each role tag that two or more procedure notes carry, with their paths. `wi validate` warns on
 * these, because a worker cannot tell which procedure to follow.
 */
export function duplicateProcedures(notes: readonly TaggedNote[]): Map<string, string[]> {
  const byTag = new Map<string, string[]>()
  for (const note of notes) {
    if (note.workItem) continue
    for (const tag of roleTags(note.tags)) {
      const key = roleTagKey(tag)
      byTag.set(key, [...(byTag.get(key) ?? []), note.path])
    }
  }
  return new Map([...byTag].filter(([, paths]) => paths.length > 1).map(([tag, paths]) => [tag, paths.sort()]))
}
