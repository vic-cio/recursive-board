/** Dispatcher selection from current vault state. This command writes nothing. */
import { dependenciesOf, openDependencies, titleOf } from '../dependencies.ts'
import { holderOf, isAnyAgent } from '../../shared/holder.ts'
import type { Vault, WorkItem } from '../vault.ts'

export type ExclusionReason = 'claimed' | 'dependency' | 'invalid-dependency' | 'active-child' | 'missing-parent'

export interface ReadyOptions {
  agent?: string
  parent?: string
}

function isBelow(vault: Vault, item: WorkItem, parent: WorkItem): boolean {
  const seen = new Set([item.relPath])
  let current = item
  while (current.parent !== null) {
    const next = vault.resolveLink(current.parent)
    if (!next || seen.has(next.relPath)) return false
    if (next === parent) return true
    seen.add(next.relPath)
    current = next
  }
  return false
}

function priority(item: WorkItem): number {
  const value = item.frontmatter.get('priority')
  return typeof value === 'number' ? value : Number.POSITIVE_INFINITY
}

function updated(item: WorkItem): string {
  const value = item.frontmatter.get('updated')
  return typeof value === 'string' ? value : ''
}

function holder(item: WorkItem): string | undefined {
  return holderOf((key) => item.frontmatter.get(key))
}

/** A request for any agent: its holder is the reserved value `agent`. */
function isRequest(item: WorkItem): boolean {
  return isAnyAgent(holder(item))
}

function summary(item: WorkItem) {
  const due = item.frontmatter.get('due')
  const owner = item.frontmatter.get('owner')
  const role = item.frontmatter.get('role')
  return {
    id: item.id ?? null, title: titleOf(item), path: item.relPath,
    priority: Number.isFinite(priority(item)) ? priority(item) : null,
    due: typeof due === 'string' ? due : null,
    owner: typeof owner === 'string' ? owner : null,
    holder: holder(item) ?? null,
    request: isRequest(item),
    role: typeof role === 'string' ? role : null,
    parent: item.parent,
  }
}

/**
 * Options are dispatchable when wi claim would accept the proposed agent. A card that asks for any
 * agent is free to claim, and comes first.
 */
export function readyCards(vault: Vault, options: ReadyOptions = {}) {
  const scope = options.parent === undefined ? null : vault.resolve(options.parent)
  const ready: WorkItem[] = []
  const excluded: { item: WorkItem; reasons: ExclusionReason[] }[] = []
  for (const item of vault.items) {
    if (item.status !== 'options' || item.parentRaw === undefined || item.area || vault.isArchived(item)) continue
    if (scope !== null && !isBelow(vault, item, scope)) continue
    const reasons: ExclusionReason[] = []
    if (item.parent === null || vault.resolveLink(item.parent) === undefined) reasons.push('missing-parent')
    if (holder(item) !== undefined && !isRequest(item)) reasons.push('claimed')
    if (openDependencies(vault, item).length > 0) reasons.push('dependency')
    const dependencies = dependenciesOf(vault, item)
    if (dependencies.unresolved.length > 0 || dependencies.malformed.length > 0) reasons.push('invalid-dependency')
    if (item.board && vault.childrenOf(item).some((child) =>
      child.status === 'doing' && (options.agent === undefined || holder(child) !== options.agent))) {
      reasons.push('active-child')
    }
    if (reasons.length === 0) ready.push(item)
    else excluded.push({ item, reasons })
  }
  ready.sort((a, b) => Number(isRequest(b)) - Number(isRequest(a)) || priority(a) - priority(b) || updated(b).localeCompare(updated(a)) || a.stem.localeCompare(b.stem))
  excluded.sort((a, b) => a.item.stem.localeCompare(b.item.stem))
  return {
    scope: scope === null ? null : { id: scope.id ?? null, title: titleOf(scope), path: scope.relPath },
    ready: ready.map(summary),
    excluded: excluded.map(({ item, reasons }) => ({ ...summary(item), reasons })),
    counts: { ready: ready.length, excluded: excluded.length },
  }
}
