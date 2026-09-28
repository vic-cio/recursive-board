/**
 * Who made a card, who owns it, and which role does its work (docs/adr/0042-creator-and-role.md).
 *
 * `creator`, `owner` and `role` hold the plain name of a person or role note. A plain name, not a
 * link: a link from every note to its creator turns the graph into one star around each person.
 * The note of that name says which it is by its `type`: `person` or `role`, and lists what it made
 * with a Bases table. The product needs no folder for them. `creator_model` holds an agent's model
 * id. This module imports nothing from Node.
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
