/**
 * Handing a card to a person or to any agent (docs/adr/0058-delegate-a-card.md,
 * docs/adr/0063-wi-starts-no-agents.md).
 *
 * Delegating names the holder and changes nothing else: the status stays. `--to agent` writes the
 * reserved holder `agent`, which asks any agent; the agent that takes it claims it by its own name.
 * wi starts no agent: each harness starts its own with its own tools. There is no reason to give:
 * the brief is on the card, and people explain where they talk. The card refuses a second holder.
 * `wi agents` tells a person from an agent by a note with `type: person`. This module imports
 * nothing from Node.
 */
import { PERSON_TYPE } from './authorship.ts'
import { cardState } from './card-state.ts'
import type { Edit } from './edits.ts'
import { ANY_AGENT, isAnyAgent, setHolderEdits } from './holder.ts'

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

export type DelegateTarget =
  | { kind: 'any' }
  | { kind: 'person'; name: string }

/**
 * What `--to` names. `agent` asks any agent; a person note of that name is refused, because the
 * name is reserved. Any other name must be a person note, because a holder with no note counts as
 * an agent in `wi agents`. An agent takes a card with `wi claim`, by its own name.
 */
export function delegateTarget(to: string, people: Map<string, string>): DelegateTarget {
  const name = to.trim()
  if (name === '') throw new Error('delegating needs a person, or agent for any agent.')
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
 * Delegating a card: the holder's name in `holder`, and nothing else. The status stays: the
 * delegator moves the card if it must move, or the holder does when they start. A second holder
 * and a done card are refused; a request for any agent gives way to any holder. Null when the
 * card has this holder already.
 */
export function assignEdits(text: string, holder: string): Edit[] | null {
  const state = cardState(text)
  if (state.status === 'done') throw new Error('a done card cannot be assigned.')
  if (state.holder === holder) return null
  if (state.holder && !isAnyAgent(state.holder)) throw new Error(`already held by ${state.holder}. Release that claim first.`)
  return setHolderEdits(holder)
}
