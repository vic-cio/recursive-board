/**
 * Handing a card to a person or an agent (docs/adr/0058-delegate-a-card.md).
 *
 * `wi delegate` and the plugin's card menu both claim the card for the delegate and write one note
 * that says who has it and why. The claim is the same edit as `wi claim`, so a delegated card
 * refuses a second claimant. A person holds a card through `agent` too; `wi agents` tells a person
 * from an agent by a note with `type: person`. This module imports nothing from Node.
 */
import { PERSON_TYPE } from './authorship.ts'
import { cardState } from './card-state.ts'
import type { Edit } from './edits.ts'
import { claimEdits } from './transitions.ts'

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

/** The claim, decided from the card's text at write time. Null when the holder already has it. */
export function delegationEdits(text: string, holder: string, hasOtherDoingChild: boolean): Edit[] | null {
  const state = cardState(text)
  return claimEdits(state.status, state.agent, holder, state.hasPrevStatus, state.board && hasOtherDoingChild)
}

export interface Delegation {
  /** The name on the claim: a person, or the worker's agent name. */
  holder: string
  harness?: Harness | undefined
  model?: string | undefined
  reason?: string | undefined
}

/** The note text: who has the card, and why when a reason is given. */
export function delegationNote({ holder, harness, model, reason }: Delegation): string {
  const who = harness === undefined
    ? holder
    : `${holder}, a headless ${harness} worker${model?.trim() ? ` on ${model.trim()}` : ''}`
  const why = reason?.trim().replace(/\.$/, '')
  return why ? `Delegated to ${who}: ${why}.` : `Delegated to ${who}.`
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
