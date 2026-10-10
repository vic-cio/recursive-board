/**
 * Assigning a card to a person or to any agent (docs/adr/0083-assign-and-several-holders.md,
 * docs/adr/0063-wi-starts-no-agents.md).
 *
 * Assigning adds one name to the card's holders and changes nothing else: the status stays, and
 * no note is written. `--to agent` adds the reserved holder `agent`, which asks any agent; the agent
 * that takes it claims it by its own name. wi starts no agent: each harness starts its own with its
 * own tools. Unassigning removes one name, again with no other change. `wi agents` tells a person
 * from an agent by a note with `type: person`. This module imports nothing from Node.
 */
import { PERSON_TYPE } from './authorship.ts'
import { cardState } from './card-state.ts'
import type { Edit } from './edits.ts'
import { ANY_AGENT, holds, isAnyAgent, sameName, setHoldersEdits } from './holder.ts'

/** A Markdown note by its vault-relative path, with its frontmatter `type`. */
export interface TypedNote {
  path: string
  type: unknown
}

/**
 * The people a vault knows: each note with `type: person`, in any folder, as the plugin's people
 * picker reads them. Keyed by the lower-case name, because a name is matched as a link is.
 */
export function peopleIn(notes: Iterable<TypedNote>): Map<string, string> {
  const people = new Map<string, string>()
  for (const { path, type } of notes) {
    if (type !== PERSON_TYPE || !path.toLowerCase().endsWith('.md')) continue
    const name = path.slice(path.lastIndexOf('/') + 1, -'.md'.length)
    if (name.trim() !== '') people.set(name.toLowerCase(), name)
  }
  return people
}

export type AssignTarget =
  | { kind: 'any' }
  | { kind: 'person'; name: string }

/**
 * What `--to` names. `agent` asks any agent; a person note of that name is refused, because the
 * name is reserved. Any other name must be a person note, because a holder with no note counts as
 * an agent in `wi agents`. An agent takes a card with `wi claim`, by its own name.
 */
export function assignTarget(to: string, people: Map<string, string>): AssignTarget {
  const name = to.trim()
  if (name === '') throw new Error('assigning needs a person, or agent for any agent.')
  if (isAnyAgent(name)) {
    const note = people.get(ANY_AGENT)
    if (note !== undefined) {
      throw new Error(`there is a person note called ${note}, and agent is the reserved holder that means any agent. Rename the note.`)
    }
    return { kind: 'any' }
  }
  const person = people.get(name.toLowerCase())
  if (person !== undefined) return { kind: 'person', name: person }
  throw new Error(`there is no person note called ${name}. Make the note ${name}.md with type: ${PERSON_TYPE}, ` +
    'or use --to agent for any agent. An agent takes a card with wi claim.')
}

/**
 * Assigning a card: the name joins its holders, and nothing else changes. The status stays: the
 * assigner moves the card if it must move, or the holder does when they start. A done card is
 * refused. Null when the card has this holder already.
 */
export function assignEdits(text: string, holder: string): Edit[] | null {
  const state = cardState(text)
  if (state.status === 'done') throw new Error('a done card cannot be assigned.')
  if (holds(state.holders, holder)) return null
  return setHoldersEdits([...state.holders, holder])
}

/** Unassigning: the name leaves the holders, and nothing else changes. Null when it is not there. */
export function unassignEdits(text: string, holder: string): Edit[] | null {
  const { holders } = cardState(text)
  if (!holds(holders, holder)) return null
  return setHoldersEdits(holders.filter((name) => !sameName(name, holder)))
}
