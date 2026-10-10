import { isAnyAgent } from './assignee.ts'
import type { Status } from './schema.ts'

/**
 * Who counts against `maxAgents` (docs/adr/0034-agent-limit.md, docs/adr/0066-count-only-working-agents.md).
 * `wi agents` reports it, and `wi claim` warns from it. This module imports nothing from Node.
 */

/** The fields of a work item that the count reads. */
export interface AgentItem {
  status: Status | undefined
  /** The people and agents who do the work. */
  assignees: readonly string[]
  /** Own flag or an ancestor's flag. */
  effectiveArchived: boolean
}

export interface AgentTree<T extends AgentItem> {
  childrenOf(item: T): T[]
}

/**
 * True when the card has open children and every one is in doing. Its assignee only waits on them,
 * so it does no work of its own.
 */
export function waitsOnChildren<T extends AgentItem>(card: T, tree: AgentTree<T>): boolean {
  const open = tree.childrenOf(card).filter((child) => child.status !== 'done' && !child.effectiveArchived)
  return open.length > 0 && open.every((child) => child.status === 'doing')
}

export interface ActiveAgent<T> {
  /** The assignee as its first working card writes it. */
  name: string
  /** The doing cards that make the agent active. */
  cards: T[]
}

/**
 * The agents that work a doing card, by name. Each agent on a card counts, so a card with several
 * agents uses several places (docs/adr/0083-assign-and-several-holders.md). People and requests
 * for any agent are not agents.
 * A card that only waits on its children does not make its assignee active, so a full tree of agents
 * cannot deadlock on the limit. Nor does a card that waits on a person, such as a review: `waitsOnPerson`
 * says which, because only the caller has the card's text. Names match without case.
 */
export function activeAgents<T extends AgentItem>(
  cards: T[], people: string[], tree: AgentTree<T>, waitsOnPerson: (card: T) => boolean = () => false,
): ActiveAgent<T>[] {
  const personNames = new Set(people.map((name) => name.trim().toLowerCase()))
  const active = new Map<string, ActiveAgent<T>>()
  for (const card of cards) {
    if (card.status !== 'doing' || card.assignees.length === 0 || waitsOnChildren(card, tree) || waitsOnPerson(card)) continue
    for (const raw of card.assignees) {
      const assignee = raw.trim()
      const key = assignee.toLowerCase()
      if (!key || isAnyAgent(key) || personNames.has(key)) continue
      const agent = active.get(key) ?? { name: assignee, cards: [] }
      if (!agent.cards.includes(card)) agent.cards.push(card)
      active.set(key, agent)
    }
  }
  return [...active.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The active agents' names in lower case. */
export function activeAgentNames<T extends AgentItem>(
  cards: T[], people: string[], tree: AgentTree<T>, waitsOnPerson: (card: T) => boolean = () => false,
): Set<string> {
  return new Set(activeAgents(cards, people, tree, waitsOnPerson).map((agent) => agent.name.toLowerCase()))
}
