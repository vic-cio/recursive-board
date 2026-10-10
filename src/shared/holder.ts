/**
 * Who does a card's work now (docs/adr/0061-holder-names-who-does-the-work.md,
 * docs/adr/0083-assign-and-several-holders.md).
 *
 * A card's `holder` names one person or agent, or a list of them. Cards written before the rename
 * carry the same fact in `agent`, so every reader takes `agent` when `holder` is absent, and every
 * writer that sets or clears the holders also removes `agent` in the same write. No bulk edit is
 * needed. A writer writes a plain value for one name, so a card with one holder reads as it did.
 * This module imports nothing from Node.
 */
import type { Edit } from './edits.ts'
import { getList, parseFrontmatter } from './frontmatter.ts'

export const HOLDER = 'holder'
/** The key that held the holder before the rename. Read, never written. */
export const LEGACY_HOLDER = 'agent'
/** The reserved holder: any agent may take the card. A worker's claim replaces it with its name. */
export const ANY_AGENT = 'agent'

/** True when two holder names name the same one: they match as a link does, without case. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** True when `name` is one of `holders`. */
export function holds(holders: readonly string[], name: string): boolean {
  return holders.some((holder) => sameName(holder, name))
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
 * The holders from a frontmatter lookup, such as Obsidian's metadata cache. A blank value or an
 * empty list is no holder; `holder` wins over `agent`. A name appears once.
 */
export function holdersOf(get: (key: string) => unknown): string[] {
  for (const key of [HOLDER, LEGACY_HOLDER]) {
    const names = namesIn(get(key))
    if (names.length > 0) return names
  }
  return []
}

/** The holders from a card's text, by the same rule. A block or flow list reads as a list. */
export function holdersIn(text: string): string[] {
  const fm = parseFrontmatter(text)
  if (fm === null) return []
  // A plain value is one name, so it is never split on commas as `getList` splits `tags`.
  return holdersOf((key) => fm.has(key) && fm.get(key) === undefined ? getList(text, key) : fm.get(key))
}

export function isAnyAgent(name: string | undefined): boolean {
  return name?.trim().toLowerCase() === ANY_AGENT
}

/** The holders as one write: a plain value for one name, a list for several, no key for none. */
export function setHoldersEdits(names: readonly string[]): Edit[] {
  const holder: Edit = names.length === 0
    ? { op: 'remove', key: HOLDER }
    : names.length === 1 ? { op: 'set', key: HOLDER, value: names[0]! } : { op: 'list', key: HOLDER, values: names }
  return [holder, { op: 'remove', key: LEGACY_HOLDER }]
}

/** The holder as a person reads it: the reserved holder reads Agent. */
export function holderLabel(name: string): string {
  return isAnyAgent(name) ? 'Agent' : name
}

/** Every holder as a person reads them, in order. */
export function holdersLabel(holders: readonly string[]): string {
  return holders.map(holderLabel).join(', ')
}

/**
 * The card face's holder badge: the first holder's initial, then `+N` for the others. The label
 * gives every name, for the hover. Null when the card has no holder.
 */
export function holderBadge(holders: readonly string[]): { text: string; label: string } | null {
  const first = holders[0]
  if (first === undefined) return null
  const more = holders.length > 1 ? `+${holders.length - 1}` : ''
  return { text: holderLabel(first).slice(0, 1).toUpperCase() + more, label: `Held by ${holdersLabel(holders)}` }
}
