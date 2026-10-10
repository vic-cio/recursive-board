/**
 * Who does a card's work now (docs/adr/0061-holder-names-who-does-the-work.md,
 * docs/adr/0083-assign-and-several-holders.md).
 *
 * A card's `assignee` names one person or agent, or a list of them. Cards written before the
 * rename carry the same fact in `holder`, and older ones in `agent`, so every reader takes
 * `assignee`, else `holder`, else `agent`, and every writer that sets or clears the assignees
 * writes `assignee` and removes `holder` and `agent` in the same write. No bulk edit is needed.
 * A writer writes a plain value for one name, so a card with one assignee reads as it did.
 * This module imports nothing from Node.
 */
import type { Edit } from './edits.ts'
import { getList, parseFrontmatter } from './frontmatter.ts'

export const ASSIGNEE = 'assignee'
/** The key that named the assignees before the rename. Read, never written. */
export const LEGACY_HOLDER = 'holder'
/** The key that named the assignee before that. Read, never written. */
export const LEGACY_AGENT = 'agent'
/** The reserved assignee: any agent may take the card. A worker's claim replaces it with its name. */
export const ANY_AGENT = 'agent'

/** True when two assignee names name the same one: they match as a link does, without case. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** True when `name` is one of `assignees`. */
export function holds(assignees: readonly string[], name: string): boolean {
  return assignees.some((assignee) => sameName(assignee, name))
}

/** The names in one field's value: a plain value is one name, a list is several. */
function namesIn(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean').map(String)
    : typeof value === 'string' ? [value] : []
  const names: string[] = []
  for (const name of raw.map((item) => item.trim())) {
    if (name !== '' && !holds(names, name)) names.push(name)
  }
  return names
}

/**
 * The assignees from a frontmatter lookup, such as Obsidian's metadata cache. A blank value or an
 * empty list is no assignee; `assignee` wins over `holder`, which wins over `agent`. A name
 * appears once.
 */
export function assigneesOf(get: (key: string) => unknown): string[] {
  for (const key of [ASSIGNEE, LEGACY_HOLDER, LEGACY_AGENT]) {
    const names = namesIn(get(key))
    if (names.length > 0) return names
  }
  return []
}

/** The assignees from a card's text, by the same rule. A block or flow list reads as a list. */
export function assigneesIn(text: string): string[] {
  const fm = parseFrontmatter(text)
  if (fm === null) return []
  // A plain value is one name, so it is never split on commas as `getList` splits `tags`.
  return assigneesOf((key) => fm.has(key) && fm.get(key) === undefined ? getList(text, key) : fm.get(key))
}

export function isAnyAgent(name: string | undefined): boolean {
  return name?.trim().toLowerCase() === ANY_AGENT
}

/** The assignees as one write: a plain value for one name, a list for several, no key for none. */
export function setAssigneesEdits(names: readonly string[]): Edit[] {
  const assignee: Edit = names.length === 0
    ? { op: 'remove', key: ASSIGNEE }
    : names.length === 1 ? { op: 'set', key: ASSIGNEE, value: names[0]! } : { op: 'list', key: ASSIGNEE, values: names }
  return [assignee, { op: 'remove', key: LEGACY_HOLDER }, { op: 'remove', key: LEGACY_AGENT }]
}

/** The assignee as a person reads it: the reserved assignee reads Agent. */
export function assigneeLabel(name: string): string {
  return isAnyAgent(name) ? 'Agent' : name
}

/** Every assignee as a person reads them, in order. */
export function assigneesLabel(assignees: readonly string[]): string {
  return assignees.map(assigneeLabel).join(', ')
}

/**
 * The card face's assignee badge: the first assignee's initial, then `+N` for the others. The
 * label gives every name, for the hover. Null when the card has no assignee.
 */
export function assigneeBadge(assignees: readonly string[]): { text: string; label: string } | null {
  const first = assignees[0]
  if (first === undefined) return null
  const more = assignees.length > 1 ? `+${assignees.length - 1}` : ''
  return { text: assigneeLabel(first).slice(0, 1).toUpperCase() + more, label: `Assigned to ${assigneesLabel(assignees)}` }
}
