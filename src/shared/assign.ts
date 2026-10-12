/**
 * Assigning a card to a person or to any agent (docs/adr/0083-assign-and-several-holders.md,
 * docs/adr/0063-wi-starts-no-agents.md).
 *
 * Assigning adds one name to the card's assignees and changes nothing else: the status stays, and
 * no note is written. `--to agent` adds the reserved assignee `agent`, which asks any agent; the agent
 * that takes it claims it by its own name. wi starts no agent: each harness starts its own with its
 * own tools. Unassigning removes one name, again with no other change. `wi agents` tells a person
 * from an agent by the people list or a note with `type: person`
 * (docs/adr/0085-people-live-in-the-plugin-data.md). This module imports nothing from Node.
 */
import { PERSON_TYPE } from './authorship.ts'
import { cardState } from './card-state.ts'
import type { Edit } from './edits.ts'
import { ANY_AGENT, holds, isAnyAgent, sameName, setAssigneesEdits } from './assignee.ts'
import { findPerson } from './people.ts'

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
 * name is reserved. Any other name must be a person, in the people list or a person note, because
 * an assignee who is no person counts as an agent in `wi agents`. The name takes the spelling the
 * vault knows. An agent takes a card with `wi claim`, by its own name.
 */
export function assignTarget(to: string, people: Map<string, string>): AssignTarget {
  const name = to.trim()
  if (name === '') throw new Error('assigning needs a person, or agent for any agent.')
  if (isAnyAgent(name)) {
    const note = people.get(ANY_AGENT)
    if (note !== undefined) {
      throw new Error(`there is a person note called ${note}, and agent is the reserved name that means any agent. Rename the note.`)
    }
    return { kind: 'any' }
  }
  const person = findPerson(people, name)
  if (person !== undefined) return { kind: 'person', name: person }
  throw new Error(`${name} is not a person in this vault: add the person in the plugin settings under People, ` +
    'or use --to agent for any agent.')
}

/**
 * Assigning a card: the name joins its assignees, and nothing else changes. The status stays: the
 * assigner moves the card if it must move, or the assignee does when they start. A done card is
 * refused. Null when the card has this assignee already.
 */
export function assignEdits(text: string, assignee: string): Edit[] | null {
  const state = cardState(text)
  if (state.status === 'done') throw new Error('a done card cannot be assigned.')
  if (holds(state.assignees, assignee)) return null
  return setAssigneesEdits([...state.assignees, assignee])
}

/** Unassigning: the name leaves the assignees, and nothing else changes. Null when it is not there. */
export function unassignEdits(text: string, assignee: string): Edit[] | null {
  const { assignees } = cardState(text)
  if (!holds(assignees, assignee)) return null
  return setAssigneesEdits(assignees.filter((name) => !sameName(name, assignee)))
}
