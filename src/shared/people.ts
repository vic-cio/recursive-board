/**
 * The people a vault knows (docs/adr/0085-people-live-in-the-plugin-data.md).
 *
 * People live in the plugin data, under `board.people`: an array of names. The plugin edits the
 * list in its People setting, and wi reads it and never writes it. A note with `type: person` in
 * any folder still counts as a person, so a vault from before the list keeps working. A name
 * matches without case, and the list's spelling wins over a note's.
 *
 * Both writers use these rules. This module imports nothing from Node.
 */
import { ANY_AGENT, sameName } from './assignee.ts'

/** The key under `board` in the plugin data that holds the people list. */
export const PEOPLE_KEY = 'people'

/** The refusal for a name that is in neither the people list nor a person note. One sentence. */
export function unknownPersonMessage(name: string): string {
  return `${name.trim()} is not a person in this vault: add the person in the plugin settings under People.`
}

/** Why `name` cannot be a person's name, or null when it can. */
export function personNameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'a person needs a name.'
  if (/[\r\n]/.test(trimmed)) return 'a name is one line.'
  // A bracket would read as a link in depends_on, and a pipe as a link alias.
  if (/[[\]|]/.test(trimmed)) return 'a name cannot contain [, ] or |.'
  if (trimmed.toLowerCase() === ANY_AGENT) return 'agent is the reserved name that means any agent.'
  return null
}

/**
 * Reads `board.people`. A missing value is an empty list. A repeat, compared without case, is
 * dropped, and the first spelling stays. Any other bad value is an error, never an empty list,
 * as for every board setting.
 */
export function parsePeopleList(value: unknown, source: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${source}: people must be an array of names.`)
  const people: string[] = []
  for (const entry of value as unknown[]) {
    const problem = typeof entry === 'string' ? personNameProblem(entry) : 'a name is a string.'
    if (problem !== null) throw new Error(`${source}: people has the entry ${JSON.stringify(entry)}, and ${problem}`)
    const name = (entry as string).trim()
    if (!people.some((known) => sameName(known, name))) people.push(name)
  }
  return people
}

/** The list with `name` added at the end. Throws the reason when the name cannot join it. */
export function withPerson(people: readonly string[], name: string): string[] {
  const problem = personNameProblem(name)
  if (problem !== null) throw new Error(problem)
  const trimmed = name.trim()
  const known = people.find((person) => sameName(person, trimmed))
  if (known !== undefined) throw new Error(`${known} is in the list already.`)
  return [...people, trimmed]
}

/** The list without `name`, compared without case. */
export function withoutPerson(people: readonly string[], name: string): string[] {
  return people.filter((person) => !sameName(person, name))
}

/**
 * Everyone the vault knows, keyed by the lower-case name: each name in the list, then each person
 * note that the list does not name. `notes` holds the note names, as `peopleIn` keys them.
 */
export function knownPeople(list: readonly string[], notes: ReadonlyMap<string, string> = new Map()): Map<string, string> {
  const people = new Map<string, string>()
  for (const name of list) people.set(name.toLowerCase(), name)
  for (const [key, name] of notes) if (!people.has(key)) people.set(key, name)
  return people
}

/** The person `name` names, in the spelling the vault knows, or undefined. */
export function findPerson(people: ReadonlyMap<string, string>, name: string): string | undefined {
  return people.get(name.trim().replace(/\.md$/i, '').toLowerCase())
}

/** The person notes the list does not name yet, sorted: the People setting offers each one. */
export function personNoteSuggestions(list: readonly string[], noteNames: Iterable<string>): string[] {
  const suggestions: string[] = []
  for (const name of noteNames) {
    if (personNameProblem(name) !== null) continue
    if (list.some((person) => sameName(person, name)) || suggestions.some((known) => sameName(known, name))) continue
    suggestions.push(name)
  }
  return suggestions.sort((a, b) => a.localeCompare(b))
}
