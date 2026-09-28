import type { WorkItemMeta } from './index.ts'

/**
 * The dashboard's rules, apart from Obsidian so they can be tested (docs/adr/0040-dashboard-view.md).
 *
 * A project is the nearest area above a card. A card waits for review when it is in doing, its
 * owner is you, and it has no open child. An agent's claim is idle when nothing in the card or
 * its children changed for an hour: its session most likely ended without a release.
 */

export type DashItem = Pick<WorkItemMeta, 'title' | 'status' | 'area' | 'board' | 'owner' | 'agent' | 'effectiveArchived' | 'parentLink'>

export interface DashTree<T extends DashItem> {
  childrenOf(item: T): T[]
  /** Root first, not including the item. */
  ancestorsOf(item: T): T[]
  /** Last modification time in milliseconds. */
  mtimeOf(item: T): number
}

export const IDLE_MS = 60 * 60 * 1000
export const FINISHED_SHOWN = 5

export function rootOf<T extends DashItem>(item: T, tree: DashTree<T>): T {
  return tree.ancestorsOf(item)[0] ?? item
}

/** The nearest area above the item, or null when it sits in no area. */
export function areaOf<T extends DashItem>(item: T, tree: DashTree<T>): T | null {
  return tree.ancestorsOf(item).reverse().find((up) => up.area) ?? null
}

/** Live cards under the root, or under every root when root is null. Areas are projects, not cards. */
export function cardsInScope<T extends DashItem>(items: T[], root: T | null, tree: DashTree<T>): T[] {
  return items.filter((item) =>
    item.parentLink !== null && item.status !== undefined && !item.area && !item.effectiveArchived &&
    (root === null || rootOf(item, tree) === root))
}

export function sameName(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && b !== undefined && a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase()
}

function hasOpenChild<T extends DashItem>(item: T, tree: DashTree<T>): boolean {
  return tree.childrenOf(item).some((child) => child.status !== 'done' && !child.effectiveArchived)
}

export function waitsForReview<T extends DashItem>(item: T, you: string, tree: DashTree<T>): boolean {
  return item.status === 'doing' && sameName(item.owner, you) && !hasOpenChild(item, tree)
}

export interface ReviewLine {
  /** What to check, with the file paths taken out. */
  what: string
  /** Vault-relative paths written in backticks, each with an extension. */
  paths: string[]
}

/**
 * Reads the card's newest `**Review:**` line. A `wi note` prefix before it is fine. Returns null
 * when the card has none.
 */
export function parseReviewLine(text: string): ReviewLine | null {
  const match = [...text.matchAll(/\*\*Review:\*\*\s*(.+)$/gm)].pop()
  if (!match) return null
  const line = match[1]!
  return {
    paths: [...line.matchAll(/`([^`]+\.[A-Za-z0-9]+)`/g)].map((found) => found[1]!),
    what: line.replace(/`[^`]+`/g, '').replace(/[\s:,]+([.;]?)\s*$/, '$1').trim(),
  }
}

export interface Group<T> {
  /** The area, or null for the cards in no area. */
  area: T | null
  name: string
}

export const NO_AREA = 'No area'

/** Areas by title, with the cards in no area last. */
export function compareGroups<T extends DashItem>(a: Group<T>, b: Group<T>): number {
  return Number(a.area === null) - Number(b.area === null) || a.name.localeCompare(b.name)
}

function groupBy<T extends DashItem, G extends Group<T>>(
  cards: T[], tree: DashTree<T>, make: (area: T | null, cards: T[]) => G,
): G[] {
  const byArea = new Map<T | null, T[]>()
  for (const card of cards) {
    const area = areaOf(card, tree)
    byArea.set(area, [...(byArea.get(area) ?? []), card])
  }
  return [...byArea].map(([area, list]) => make(area, list)).sort(compareGroups)
}

export interface Progress<T> extends Group<T> {
  done: number
  doing: number
  total: number
}

/** Progress counts leaf cards. A board is a container, and its children carry the work. */
export function progress<T extends DashItem>(cards: T[], tree: DashTree<T>): Progress<T>[] {
  return groupBy(cards.filter((card) => !card.board), tree, (area, list) => ({
    area,
    name: area?.title ?? NO_AREA,
    done: list.filter((card) => card.status === 'done').length,
    doing: list.filter((card) => card.status === 'doing').length,
    total: list.length,
  }))
}

export interface Claim<T> {
  card: T
  /** The newest change to the card or its children. */
  active: number
  steps: T[]
}

export interface AgentGroup<T> extends Group<T> {
  working: Claim<T>[]
  idle: Claim<T>[]
  finished: Claim<T>[]
}

/**
 * Agents come from the `agent` field that `wi claim` writes. It stays on the card when done.
 * A card handed to you, or with every step done, has an agent that finished.
 */
export function agentGroups<T extends DashItem>(
  cards: T[], you: string, tree: DashTree<T>, now: number,
): AgentGroup<T>[] {
  const claims: Claim<T>[] = cards
    .filter((card) => card.agent !== undefined)
    .map((card) => {
      const steps = tree.childrenOf(card).filter((child) => !child.effectiveArchived)
      return { card, steps, active: Math.max(tree.mtimeOf(card), ...steps.map((step) => tree.mtimeOf(step))) }
    })
    .sort((a, b) => b.active - a.active)
  const handedOver = (claim: Claim<T>) => sameName(claim.card.owner, you) ||
    (claim.steps.length > 0 && claim.steps.every((step) => step.status === 'done'))
  const groups = groupBy(claims.map((claim) => claim.card), tree, (area, list) => {
    const mine = claims.filter((claim) => list.includes(claim.card))
    const doing = mine.filter((claim) => claim.card.status === 'doing' && !handedOver(claim))
    return {
      area,
      name: area?.title ?? NO_AREA,
      working: doing.filter((claim) => now - claim.active < IDLE_MS),
      idle: doing.filter((claim) => now - claim.active >= IDLE_MS),
      finished: mine.filter((claim) => !doing.includes(claim) &&
        (claim.card.status === 'done' || claim.card.status === 'doing')).slice(0, FINISHED_SHOWN),
    }
  })
  return groups
}

export function ago(ms: number, now: number): string {
  const minutes = Math.round((now - ms) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h`
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
