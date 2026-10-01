/**
 * The dashboard's summary for an agent. This command writes nothing. It applies the plugin's own
 * rules from src/shared/dashboard.ts, so `wi dashboard` and the dashboard view cannot disagree.
 * The CLI keeps no per-person state, so the reviewer is a command input.
 */
import { stat } from 'node:fs/promises'

import { displayName } from '../../shared/authorship.ts'
import { holderOf } from '../../shared/holder.ts'
import {
  agentFeed, cardsInScope, groupName, groupUnder, inFocus, needsAttention, parseReviewLine, progress,
  waitsForReview, workingBadge, type AgentRow, type DashItem, type DashTree,
} from '../../shared/dashboard.ts'
import { dependenciesOf, titleOf } from '../dependencies.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface DashboardOptions {
  /** The reviewer. With none, no card waits for review. */
  you?: string
  /** A root narrows the cards to that root. An area focuses on it, as a click on its Progress row does. */
  parent?: string
  now?: number
}

interface Card extends DashItem {
  item: WorkItem
  mtime: number
}

function identity(card: Card) {
  return { id: card.item.id ?? null, title: card.title, path: card.item.relPath }
}

/** Reads each item the way the plugin's index does, with its file's modification time. */
async function cardsOf(vault: Vault): Promise<Map<WorkItem, Card>> {
  const cards = new Map<WorkItem, Card>()
  for (const item of vault.items) {
    cards.set(item, {
      item,
      title: titleOf(item),
      status: item.status,
      area: item.area,
      board: item.board,
      owner: displayName(item.frontmatter.get('owner')),
      holder: holderOf((key) => item.frontmatter.get(key)),
      effectiveArchived: vault.isArchived(item),
      parentLink: item.parentRaw === undefined ? null : item.parent ?? item.parentRaw,
      mtime: (await stat(item.path)).mtimeMs,
    })
  }
  return cards
}

function treeOf(vault: Vault, cards: Map<WorkItem, Card>): DashTree<Card> {
  const card = (item: WorkItem) => cards.get(item)!
  return {
    childrenOf: (of) => vault.childrenOf(of.item).map(card),
    ancestorsOf: (of) => {
      const chain: Card[] = []
      const seen = new Set([of.item.relPath])
      // Never loop, even on a broken vault.
      for (let up = vault.resolveLink(of.item.parent); up && !seen.has(up.relPath); up = vault.resolveLink(up.parent)) {
        seen.add(up.relPath)
        chain.unshift(card(up))
      }
      return chain
    },
    mtimeOf: (of) => of.mtime,
  }
}

export async function dashboardSummary(vault: Vault, options: DashboardOptions = {}) {
  const now = options.now ?? Date.now()
  const you = options.you?.trim() || null
  const cards = await cardsOf(vault)
  const tree = treeOf(vault, cards)

  let root: Card | null = null
  let focus: Card | null = null
  if (options.parent !== undefined) {
    const named = cards.get(vault.resolve(options.parent))!
    if (named.area) focus = named
    else if (named.parentLink === null) root = named
    else throw new Error(`wi dashboard --parent needs a root or an area; ${named.title} is a card.`)
  }

  const scope = cardsInScope([...cards.values()], root, tree)
  const focused = scope.filter((card) => inFocus(card, focus, tree))
  const area = (card: Card) => groupName(groupUnder(card, focus, tree), focus)

  const review = focused.filter((card) => you !== null && waitsForReview(card, you, tree, card.item.text)).map((card) => {
    const line = parseReviewLine(card.item.text)
    return { ...identity(card), area: area(card), holder: card.holder ?? null, what: line?.what || 'Open the card.', paths: line?.paths ?? [] }
  })

  // The feed, the working counts and the quiet claims in attention all come from this one list.
  const feed = agentFeed(scope, you ?? '', tree, now, focus)
  const claim = (row: AgentRow<Card>) => ({
    holder: row.card.holder!, ...identity(row.card), status: row.card.status!, area: area(row.card),
    active: new Date(row.active).toISOString(),
    steps: { done: row.steps.filter((step) => step.status === 'done').length, total: row.steps.length },
  })

  const attention = needsAttention(focused,
    (card) => dependenciesOf(vault, card.item).resolved.map((item) => cards.get(item)!),
    feed.idle.map((row) => row.card))
  const count = (reason: string) => attention.filter((row) => row.reason === reason).length

  return {
    generated: new Date(now).toISOString(),
    you,
    scope: { root: root && identity(root), focus: focus && identity(focus) },
    counts: {
      review: review.length, working: feed.working.length, idle: feed.idle.length, finished: feed.finished.length,
      attention: { total: attention.length, started: count('started'), archived: count('archived'), quiet: count('quiet') },
    },
    review,
    progress: progress(scope, tree, focus).map((row) => ({
      area: row.area && identity(row.area), name: row.name,
      done: row.done, doing: row.doing, total: row.total, backlog: row.backlog,
      percent: row.total ? Math.round((100 * row.done) / row.total) : 0,
      working: workingBadge(feed, row.area),
    })),
    agents: { working: feed.working.map(claim), idle: feed.idle.map(claim), finished: feed.finished.map(claim) },
    attention: attention.map((row) => ({
      reason: row.reason, ...identity(row.card), holder: row.card.holder ?? null, cards: row.cards.map(identity),
    })),
  }
}

export type DashboardSummary = Awaited<ReturnType<typeof dashboardSummary>>

/** One count per section, then one line per card, for a person at a terminal. */
export function renderDashboard(summary: DashboardSummary): string {
  const { counts } = summary
  const card = (row: { id: string | null; title: string }) => `${row.id ?? '?'}  ${row.title}`
  const claims = (rows: DashboardSummary['agents']['working']) => rows.map((row) => `  ${row.holder}  ${card(row)}  (${row.area})`)
  return [
    `review  ${counts.review}`, ...summary.review.map((row) => `  ${card(row)}  ${row.what}`),
    'progress', ...summary.progress.map((row) => `  ${row.name}  ${row.done}/${row.total} done, ${row.doing} doing, ${row.backlog} in backlog`),
    `working  ${counts.working}`, ...claims(summary.agents.working),
    `idle  ${counts.idle}`, ...claims(summary.agents.idle),
    `finished  ${counts.finished}`, ...claims(summary.agents.finished),
    `attention  ${counts.attention.total}`, ...summary.attention.map((row) => `  ${row.reason}  ${card(row)}`),
  ].join('\n') + '\n'
}
