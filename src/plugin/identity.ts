/**
 * "Your name": who this device is (docs/adr/0085-people-live-in-the-plugin-data.md).
 *
 * The name is one of the people in the people list. Each device stores its own choice in
 * Obsidian's local storage, never in the synced plugin data, so two people who share a vault each
 * see their own cards as theirs. With no stored choice, the default is the person whose name is
 * the Obsidian account name on this device, when there is one.
 *
 * This module imports nothing from Obsidian or Node, so a test can run it.
 */
import { ANY_AGENT, holds, sameName } from '../shared/assignee.ts'

/** The local storage key for this device's choice. */
export const YOUR_NAME_KEY = 'recursive-board:your-name'

/**
 * The Obsidian account name on this device, or an empty string. Obsidian has no public API for
 * it. Builds before 1.6 kept the signed-in account at `app.account`, and the field is read only
 * when it is a string, so a build without it gives an empty default.
 */
export function accountName(app: unknown): string {
  const account = record(record(app)['account'])
  const name = account['name']
  return typeof name === 'string' ? name.trim() : ''
}

/**
 * The person this device is. A stored choice wins: a name in the list takes the list's spelling,
 * and an empty string means the person chose no one. With no stored choice, the account name
 * picks the matching person. A name that is no longer in the list gives an empty string.
 */
export function resolveYourName(stored: unknown, people: readonly string[], account: string): string {
  const wanted = typeof stored === 'string' ? stored : account
  if (wanted.trim() === '') return ''
  return people.find((person) => sameName(person, wanted)) ?? ''
}

/** True when `name` is this device's person. */
export function isYou(name: string, you: string): boolean {
  return you.trim() !== '' && sameName(name, you)
}

/**
 * The wait badge's label: "Waits on you" when the card waits on this device's person, else the
 * names. You come first, then the other people, then the cards.
 */
export function waitsOnLabel(cards: readonly string[], people: readonly string[], you: string): string {
  const mine = people.some((name) => isYou(name, you))
  const others = people.filter((name) => !isYou(name, you))
  return `Waits on ${[...(mine ? ['you'] : []), ...others, ...cards].join(', ')}`
}

/** The people, sorted, with this device's person first. */
export function youFirst(people: readonly string[], you: string): string[] {
  const sorted = [...people].sort((a, b) => a.localeCompare(b))
  const me = sorted.find((name) => isYou(name, you))
  return me === undefined ? sorted : [me, ...sorted.filter((name) => name !== me)]
}

/** One row in the "Assign to…" picker. */
export type AssignChoice =
  | { kind: 'me'; name: string }
  | { kind: 'person'; name: string }
  | { kind: 'agent' }

/** The name a choice adds to the assignees. */
export function assigneeOfChoice(choice: AssignChoice): string {
  return choice.kind === 'agent' ? ANY_AGENT : choice.name
}

/**
 * The "Assign to…" rows: "Assign to me" first when Your name is set, then each other person, then
 * any agent. A name the card has already is left out.
 */
export function assignChoices(people: readonly string[], you: string, assignees: readonly string[]): AssignChoice[] {
  const sorted = youFirst(people, you)
  const choices: AssignChoice[] = sorted.map((name): AssignChoice => isYou(name, you) ? { kind: 'me', name } : { kind: 'person', name })
  choices.push({ kind: 'agent' })
  return choices.filter((choice) => !holds(assignees, assigneeOfChoice(choice)))
}

/** The people the "Waits on…" picker offers: you first, and no one the card waits on already. */
export function waitChoices(people: readonly string[], you: string, waitingOn: readonly string[]): string[] {
  return youFirst(people, you).filter((name) => !holds(waitingOn, name))
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}
