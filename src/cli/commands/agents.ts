/**
 * The agents that count against `maxAgents`, and the limit. This command writes nothing. It applies
 * the shared rule from src/shared/agents.ts, so `wi agents` and the warning in `wi claim` agree
 * (docs/adr/0066-count-only-working-agents.md).
 */
import { activeAgents, type AgentItem, type AgentTree } from '../../shared/agents.ts'
import { holderOf } from '../../shared/holder.ts'
import { awaitsReviewVerdict } from '../../shared/review.ts'
import { titleOf } from '../dependencies.ts'
import { maxAgentsForRun, readPeople, type Vault, type WorkItem } from '../vault.ts'

interface Card extends AgentItem {
  item: WorkItem
}

async function activeIn(vault: Vault) {
  const cards = new Map<WorkItem, Card>(vault.items.map((item) => [item, {
    item,
    status: item.status,
    holder: holderOf((key) => item.frontmatter.get(key)),
    effectiveArchived: vault.isArchived(item),
  }]))
  const tree: AgentTree<Card> = { childrenOf: (card) => vault.childrenOf(card.item).map((child) => cards.get(child)!) }
  const people = [...(await readPeople(vault.root)).values()]
  // A card that waits for a review verdict does not make its holder an active agent.
  return activeAgents([...cards.values()], people, tree, (card) => awaitsReviewVerdict(card.item.text))
}

/** The active agents' names in lower case. `wi claim` warns from this set. */
export async function activeAgentsOf(vault: Vault): Promise<Set<string>> {
  return new Set((await activeIn(vault)).map((agent) => agent.name.toLowerCase()))
}

export async function agentsReport(vault: Vault) {
  const agents = await activeIn(vault)
  return {
    activeAgents: agents.length,
    maxAgents: maxAgentsForRun(vault),
    agents: agents.map((agent) => ({
      name: agent.name,
      cards: agent.cards.map((card) => ({ id: card.item.id ?? null, title: titleOf(card.item), path: card.item.relPath })),
    })),
  }
}

export type AgentsReport = Awaited<ReturnType<typeof agentsReport>>

export function renderAgents(report: AgentsReport): string {
  const lines = [`${report.activeAgents} active, limit ${report.maxAgents ?? 'none'}`]
  for (const agent of report.agents) {
    lines.push(`  ${agent.name}`, ...agent.cards.map((card) => `    ${card.id ?? '?'}  ${card.title}`))
  }
  return lines.join('\n') + '\n'
}
