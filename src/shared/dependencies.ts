/**
 * Card dependencies (docs/adr/0041-card-dependencies.md).
 *
 * `depends_on` is a list of the cards and people this card waits on. A card is a wikilink, and a
 * dependency on it is open until the card is done. A person is a plain name, such as `Ana`: that is
 * a wait on a person, the way to ask for a review (docs/adr/0085-people-live-in-the-plugin-data.md).
 * An older wait on a person is a wikilink to a person note (`type: person`), and it still counts.
 * A person wait is open until the person removes it, and moving the card to done removes it too
 * (docs/adr/0082-review-is-a-wait-on-a-person.md). An archived card that is not done stays open: archiving drops the work, and
 * the card that needed it must not start without a decision. Nothing is written when a dependency
 * closes; the wait is derived at read time.
 *
 * Both writers use these rules. This module imports nothing from Node.
 */
import type { Edit } from './edits.ts'
import { getList, parseFrontmatter } from './frontmatter.ts'
import { sameName } from './assignee.ts'
import { personNameProblem } from './people.ts'
import { formatWikilink, parseWikilink, type Status } from './schema.ts'

export const DEPENDS_ON = 'depends_on'

/** One `depends_on` entry: a link to a card or a person note, a person's name, or neither. */
export type DependencyEntry =
  | { kind: 'link'; target: string }
  | { kind: 'person'; name: string }
  | { kind: 'malformed'; text: string }

/**
 * What one entry is. A wikilink is a link. Any other one-line text without brackets is a
 * person's name, whether or not the vault knows the person: a wait must keep blocking on a
 * device whose people list has not synced yet. `wi validate` reports a name that no one has.
 */
export function dependencyEntry(value: unknown): DependencyEntry {
  const target = parseWikilink(value)
  if (target !== null) return { kind: 'link', target }
  if (typeof value === 'string' && personNameProblem(value) === null) return { kind: 'person', name: value.trim() }
  return { kind: 'malformed', text: String(value) }
}

export interface ParsedDependencies {
  /** Wikilink targets, in file order, without repeats. */
  targets: string[]
  /** Plain names, each a wait on a person, in file order, without repeats in any case. */
  people: string[]
  /** Entries that are neither a wikilink nor a name. */
  malformed: string[]
}

export function parseDependsOn(values: readonly unknown[] | undefined): ParsedDependencies {
  const targets: string[] = []
  const people: string[] = []
  const malformed: string[] = []
  for (const value of values ?? []) {
    const entry = dependencyEntry(value)
    if (entry.kind === 'malformed') malformed.push(entry.text)
    else if (entry.kind === 'link') {
      if (!targets.includes(entry.target)) targets.push(entry.target)
    } else if (!people.some((name) => sameName(name, entry.name))) people.push(entry.name)
  }
  return { targets, people, malformed }
}

/** Reads the `depends_on` value Obsidian's metadata cache gives: a list, one string, or nothing. */
export function dependsOnValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return value === undefined || value === null ? [] : [value]
}

/**
 * The raw `depends_on` entries in a card's text. One wikilink on the key line is a string, not a
 * list to split on spaces as `tags` would be.
 */
export function dependsOnRaw(text: string): string[] {
  const scalar = parseFrontmatter(text)?.get(DEPENDS_ON)
  return typeof scalar === 'string' ? [scalar] : getList(text, DEPENDS_ON) ?? []
}

export interface Dependency {
  status: Status | undefined
}

export function isOpenDependency(dependency: Dependency): boolean {
  return dependency.status !== 'done'
}

/**
 * The list edit that adds or removes one dependency. Returns null when nothing changes.
 * Other entries keep their text and order, so an unresolved or odd entry survives. `names`
 * says whether an entry's link target means the card, since two spellings can resolve to one file.
 */
export function dependencyEdit(
  current: readonly string[], target: string, on: boolean,
  names: (linkTarget: string) => boolean = (linkTarget) => linkTarget === target,
): Edit | null {
  const means = (value: string) => {
    const linkTarget = parseWikilink(value)
    return linkTarget !== null && names(linkTarget)
  }
  const has = current.some(means)
  if (on === has) return null
  const values = on ? [...current, formatWikilink(target)] : current.filter((value) => !means(value))
  return { op: 'list', key: DEPENDS_ON, values }
}

/** `dependencyEdit` on the list as the card's text holds it now. */
export function dependencyEditIn(
  text: string, target: string, on: boolean,
  names?: (linkTarget: string) => boolean,
): Edit | null {
  return dependencyEdit(dependsOnRaw(text), target, on, names)
}

/**
 * The list edit that adds or removes one wait on a person. Adding writes the plain name, such as
 * `Ana`. Removing takes the plain name in any case, and each link that `isThisPerson` says is a
 * wait on the same person, so an older `[[Ana]]` goes too. Returns null when nothing changes.
 * Other entries keep their text and order.
 */
export function personWaitEdit(
  current: readonly string[], name: string, on: boolean,
  isThisPerson: (linkTarget: string) => boolean = () => false,
): Edit | null {
  const means = (value: string) => {
    const entry = dependencyEntry(value)
    if (entry.kind === 'person') return sameName(entry.name, name)
    return entry.kind === 'link' && isThisPerson(entry.target)
  }
  const has = current.some(means)
  if (on === has) return null
  const values = on ? [...current, name.trim()] : current.filter((value) => !means(value))
  return { op: 'list', key: DEPENDS_ON, values }
}

/** `personWaitEdit` on the list as the card's text holds it now. */
export function personWaitEditIn(
  text: string, name: string, on: boolean,
  isThisPerson?: (linkTarget: string) => boolean,
): Edit | null {
  return personWaitEdit(dependsOnRaw(text), name, on, isThisPerson)
}

/**
 * The edit that clears every wait on a person: each plain name, and each link that `isPerson`
 * names. Every other entry keeps its text and order. Returns null when no entry is a person wait.
 */
export function clearPersonWaitsEdit(
  current: readonly string[], isPerson: (linkTarget: string) => boolean,
): Edit | null {
  const keep = current.filter((value) => {
    const entry = dependencyEntry(value)
    if (entry.kind === 'person') return false
    return entry.kind === 'malformed' || !isPerson(entry.target)
  })
  return keep.length === current.length ? null : { op: 'list', key: DEPENDS_ON, values: keep }
}

/** A chain of dependencies from `from` back to `from`, or null when there is none. Nodes compare by identity. */
export function dependencyCycle<T>(from: T, dependsOn: (node: T) => readonly T[]): T[] | null {
  return dependencyPath(from, from, dependsOn)
}

/** A chain of dependencies from `from` to `to`, both included, or null when `from` does not wait on `to`. Nodes compare by identity. */
export function dependencyPath<T>(from: T, to: T, dependsOn: (node: T) => readonly T[]): T[] | null {
  return dependencyPathByKey(from, to, (node) => node, dependsOn)
}

/**
 * `dependencyPath` for nodes that are rebuilt, such as the plugin's index entries: nodes compare
 * by `key`, so a copy taken before a rebuild still matches its replacement.
 */
export function dependencyPathByKey<T>(
  from: T, to: T, key: (node: T) => unknown, dependsOn: (node: T) => readonly T[],
): T[] | null {
  const target = key(to)
  const seen = new Set<unknown>([key(from)])
  const walk = (node: T, path: T[]): T[] | null => {
    for (const next of dependsOn(node)) {
      const nextKey = key(next)
      if (nextKey === target) return [...path, next]
      if (seen.has(nextKey)) continue
      seen.add(nextKey)
      const found = walk(next, [...path, next])
      if (found) return found
    }
    return null
  }
  return walk(from, [from])
}

/** The refusal `wi claim` and `wi status doing` give a card that waits on open cards or on people. */
export function waitingRefusal(card: string, open: readonly string[], people: readonly string[] = []): string {
  const parts = [`${card} waits on ${[...open, ...people].join(', ')}.`]
  if (open.length > 0) {
    parts.push(`Finish ${open.length === 1 ? 'that card' : 'those cards'} first, ` +
      'or remove the dependency with wi depend <card> --on <dependency> --off.')
  }
  if (people.length > 0) {
    parts.push(`${people.length === 1 ? 'The person clears' : 'The people clear'} a wait by removing it. ` +
      'Remove it yourself with wi depend <card> --on <person> --off.')
  }
  return parts.join(' ')
}
