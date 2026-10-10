/**
 * The agents that count against `maxAgents`, and the limit. This command writes nothing. It applies
 * the shared rule from src/shared/agents.ts, so `wi agents` and the warning in `wi claim` agree
 * (docs/adr/0066-count-only-working-agents.md).
 */
import { activeAgents, type AgentItem, type AgentTree } from '../agents.ts'
import { holderOf } from '../holder.ts'
import { dependenciesOf, titleOf } from '../item-dependencies.ts'
import { maxAgentsForRun, readPeople, type Env, type Vault, type WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { json } from './output.ts'

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
  const people = [...(await readPeople(vault.port)).values()]
  // A card that waits on a person, such as a review, does not make its holder an active agent.
  return activeAgents([...cards.values()], people, tree, (card) => dependenciesOf(vault, card.item).people.length > 0)
}

/** The active agents' names in lower case. `wi claim` warns from this set. */
export async function activeAgentsOf(vault: Vault): Promise<Set<string>> {
  return new Set((await activeIn(vault)).map((agent) => agent.name.toLowerCase()))
}

/** `env` may override the vault's limit with WI_MAX_AGENTS. */
export async function agentsReport(vault: Vault, env: Env) {
  const agents = await activeIn(vault)
  return {
    activeAgents: agents.length,
    maxAgents: maxAgentsForRun(vault, env),
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

/** `wi agents`: the active agents and the limit. WI_MAX_AGENTS comes from the context's environment. */
export const runAgents: RunFunction = async (context, line) => {
  const vault = await context.vault()
  if (line.positionals.length > 1) throw new UsageError('wi agents takes no card reference.')
  const report = await agentsReport(vault, context.env)
  context.out(line.values['json'] === true ? json(report) : renderAgents(report))
  return 0
}
