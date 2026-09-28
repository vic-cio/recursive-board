/**
 * Who made a card, who owns it, and which role does its work (docs/adr/0042-creator-and-role.md).
 *
 * `creator`, `owner` and `role` name people and roles by a link to their note, so Obsidian's
 * backlinks and graph show everything a person or role made. The linked note's `type` says which
 * it is: `person` or `role`. The product needs no folder for them. `creator_model` holds an
 * agent's model id. This module imports nothing from Node.
 */
import { formatWikilink, parseWikilink } from './schema.ts'

export const PERSON_TYPE = 'person'
export const ROLE_TYPE = 'role'

/** The note types each field may link to. */
export const LINK_FIELDS = {
  creator: [PERSON_TYPE, ROLE_TYPE],
  owner: [PERSON_TYPE],
  role: [ROLE_TYPE],
} as const
export type LinkField = keyof typeof LINK_FIELDS

/** A name as a link. A value that is a link already stays as written. */
export function asLink(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('a name cannot be empty.')
  return parseWikilink(trimmed) === null ? formatWikilink(trimmed) : trimmed
}

/** The name to show: a link's target, or the plain text. */
export function displayName(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return parseWikilink(value) ?? value.trim()
}

/** "Checker (gpt-6-luna)", "Victor", or undefined when there is no name. */
export function authorLabel(name: string | undefined, model: string | undefined): string | undefined {
  const who = displayName(name)
  if (who === undefined) return undefined
  const runtime = model?.trim()
  return runtime ? `${who} (${runtime})` : who
}

/** Why a link field's target is the wrong kind of note, or null when it is fine. */
export function linkTypeProblem(field: LinkField, target: string, type: unknown): string | null {
  const allowed: readonly string[] = LINK_FIELDS[field]
  if (typeof type === 'string' && allowed.includes(type)) return null
  const want = allowed.map((kind) => `type: ${kind}`).join(' or ')
  return `links ${field} to [[${target}]], which has ${typeof type === 'string' ? `type: ${type}` : 'no type'}. ` +
    `Give that note ${want}.`
}
