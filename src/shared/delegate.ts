/**
 * Handing a card to a person or an agent (docs/adr/0058-delegate-a-card.md).
 *
 * For an agent, `wi delegate` claims the card as `wi claim` does, starts the worker and notes where
 * it runs. For a person, it only assigns the card: their name goes in `agent` and the status stays.
 * There is no reason to give: the brief is on the card, and people explain where they talk. Either
 * way the card refuses a second holder. A person holds a card through `agent` too; `wi agents` tells a person
 * from an agent by a note with `type: person`. This module imports nothing from Node.
 */
import { PERSON_TYPE } from './authorship.ts'
import { cardState } from './card-state.ts'
import type { Edit } from './edits.ts'
import { setHolderEdits } from './holder.ts'

export const HARNESSES = ['claude', 'codex', 'pi'] as const
export type Harness = typeof HARNESSES[number]

export function isHarness(value: string): value is Harness {
  return (HARNESSES as readonly string[]).includes(value)
}

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
  | { kind: 'agent'; harness: Harness }
  | { kind: 'person'; name: string }

/**
 * What `--to` names. A harness wins over a person note of the same name. Any other name is refused,
 * because a claim by a name with no note would count as an agent in `wi agents`.
 */
export function delegateTarget(to: string, people: Map<string, string>): DelegateTarget {
  const name = to.trim()
  if (name === '') throw new Error('delegating needs a person or a harness: claude, codex or pi.')
  if (isHarness(name)) return { kind: 'agent', harness: name }
  const person = people.get(name.toLowerCase())
  if (person !== undefined) return { kind: 'person', name: person }
  throw new Error(`there is no person note called ${name}. ` +
    `Make the note ${name}.md with type: ${PERSON_TYPE} for a person, or name a harness: ${HARNESSES.join(', ').replace(/, (?=[^,]*$)/, ' or ')}.`)
}

/** The agent name a worker claims under, unique per card: `codex-price-the-job`. */
export function workerName(harness: Harness, slug: string): string {
  return `${harness}-${slug}`
}

/**
 * Assigning a card to a person: their name in `agent`, and nothing else. The status stays, because
 * a person chooses when to start. A second holder and a done card are refused. Null when the
 * person already holds the card.
 */
export function assignEdits(text: string, person: string): Edit[] | null {
  const state = cardState(text)
  if (state.status === 'done') throw new Error('a done card cannot be assigned.')
  if (state.holder && state.holder !== person) throw new Error(`already held by ${state.holder}. Release that claim first.`)
  return state.holder === person ? null : setHolderEdits(person)
}

export interface Delegation {
  /** The worker's agent name. */
  holder: string
  harness: Harness
  model?: string | undefined
}

/** The note for a worker: who has the card, on which harness and model. */
export function delegationNote({ holder, harness, model }: Delegation): string {
  return `Delegated to ${holder}, a headless ${harness} worker${model?.trim() ? ` on ${model.trim()}` : ''}.`
}

/**
 * The slug in the worker's branch `card/<slug>`, its worktree folder and its agent name. It comes
 * from the title, cut at a word to 40 characters; a title with no letters or digits gives the id.
 */
export function cardSlug(title: string, fallback: string): string {
  const words = title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const cut = words.length <= 40 ? words : words.slice(0, 41).replace(/-[^-]*$/, '') || words.slice(0, 40)
  return cut === '' ? fallback : cut
}
