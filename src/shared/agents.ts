import { isAnyAgent } from './holder.ts'
import type { Status } from './schema.ts'

/**
 * Who counts against `maxAgents` (docs/adr/0034-agent-limit.md, docs/adr/0066-count-only-working-agents.md).
 * `wi agents` reports it, and `wi claim` warns from it. This module imports nothing from Node.
 */

/** The fields of a work item that the count reads. */
export interface AgentItem {
  status: Status | undefined
  /** The person or agent who does the work. */
  holder: string | undefined
  /** Own flag or an ancestor's flag. */
  effectiveArchived: boolean
}

export interface AgentTree<T extends AgentItem> {
  childrenOf(item: T): T[]
}

/**
 * True when the card has open children and every one is in doing. Its holder only waits on them,
 * so it does no work of its own.
 */
export function waitsOnChildren<T extends AgentItem>(card: T, tree: AgentTree<T>): boolean {
  const open = tree.childrenOf(card).filter((child) => child.status !== 'done' && !child.effectiveArchived)
  return open.length > 0 && open.every((child) => child.status === 'doing')
}

export interface ActiveAgent<T> {
  /** The holder as its first working card writes it. */
  name: string
  /** The doing cards that make the agent active. */
  cards: T[]
}

/**
 * The agents that work a doing card, by name. People and requests for any agent are not agents.
 * A card that only waits on its children does not make its holder active, so a full tree of agents
 * cannot deadlock on the limit. Nor does a card that waits for a review verdict: `awaitsReview`
 * says which, because only the caller has the card's text. Names match without case.
 */
export function activeAgents<T extends AgentItem>(
  cards: T[], people: string[], tree: AgentTree<T>, awaitsReview: (card: T) => boolean = () => false,
): ActiveAgent<T>[] {
  const personNames = new Set(people.map((name) => name.trim().toLowerCase()))
  const active = new Map<string, ActiveAgent<T>>()
  for (const card of cards) {
    const holder = card.holder?.trim()
    const key = holder?.toLowerCase()
    if (card.status !== 'doing' || !holder || !key || isAnyAgent(key) || personNames.has(key) ||
      waitsOnChildren(card, tree) || awaitsReview(card)) continue
    const agent = active.get(key) ?? { name: holder, cards: [] }
    agent.cards.push(card)
    active.set(key, agent)
  }
  return [...active.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The active agents' names in lower case. */
export function activeAgentNames<T extends AgentItem>(
  cards: T[], people: string[], tree: AgentTree<T>, awaitsReview: (card: T) => boolean = () => false,
): Set<string> {
  return new Set(activeAgents(cards, people, tree, awaitsReview).map((agent) => agent.name.toLowerCase()))
}
