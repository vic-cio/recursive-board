/**
 * Names for card authorship, ownership and roles (docs/adr/0042-creator-and-role.md).
 *
 * Legacy `creator`, `owner` and `role` fields hold the plain name of a person or role note. A plain name, not a
 * link: a link from every note to its creator turns the graph into one star around each person.
 * The note of that name says which it is by its `type`: `person` or `role`, and lists what it made
 * with a Bases table. The product needs no folder for them. New cards do not write creator fields.
 * This module imports nothing from Node.
 */
import { parseWikilink } from './schema.ts'

export const PERSON_TYPE = 'person'
export const ROLE_TYPE = 'role'

/** The note types each field may link to. */
export const LINK_FIELDS = {
  creator: [PERSON_TYPE, ROLE_TYPE],
  owner: [PERSON_TYPE],
  role: [ROLE_TYPE],
} as const
export type LinkField = keyof typeof LINK_FIELDS

/** The plain name to write. A link given by habit becomes its target: `[[Ana]]` is `Ana`. */
export function asName(name: string): string {
  const plain = displayName(name)
  if (plain === undefined) throw new Error('a name cannot be empty.')
  return plain
}

/** The name to show: a link's target, or the plain text. */
export function displayName(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return parseWikilink(value) ?? value.trim()
}

/** "Checker (gpt-6-luna)", "Ana", or undefined when there is no name. */
export function authorLabel(name: string | undefined, model: string | undefined): string | undefined {
  const who = displayName(name)
  if (who === undefined) return undefined
  const runtime = model?.trim()
  return runtime ? `${who} (${runtime})` : who
}

/** Why a field's note is the wrong kind of note, or null when it is fine. */
export function linkTypeProblem(field: LinkField, target: string, type: unknown): string | null {
  const allowed: readonly string[] = LINK_FIELDS[field]
  if (typeof type === 'string' && allowed.includes(type)) return null
  const want = allowed.map((kind) => `type: ${kind}`).join(' or ')
  return `names ${target} as its ${field}, and that note has ${typeof type === 'string' ? `type: ${type}` : 'no type'}. ` +
    `Give that note ${want}.`
}

/** Resolve a card's own role, or the nearest ancestor role, without writing a copy. */
export function resolveRole(ownRole: unknown, ancestorRoles: readonly unknown[]): { role: string | undefined; inherited: boolean } {
  const own = displayName(ownRole)
  if (own !== undefined) return { role: own, inherited: false }
  for (const role of ancestorRoles) {
    const name = displayName(role)
    if (name !== undefined) return { role: name, inherited: true }
  }
  return { role: undefined, inherited: false }
}
