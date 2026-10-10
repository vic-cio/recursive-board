/** Dispatcher selection from current vault state. This command writes nothing. */
import { dependenciesOf, openWaits, titleOf } from '../item-dependencies.ts'
import { holds, assigneesIn, isAnyAgent } from '../assignee.ts'
import type { Vault, WorkItem } from '../vault.ts'
import { getList } from '../frontmatter.ts'
import { roleTags } from '../role-tags.ts'
import { UsageError, type RunFunction } from './command.ts'
import { json } from './output.ts'
import { singleLineOption } from './options.ts'

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

function assignees(item: WorkItem): string[] {
  return assigneesIn(item.text)
}

/** A request for any agent: its only assignee is the reserved value `agent`. */
function isRequest(item: WorkItem): boolean {
  const names = assignees(item)
  return names.length > 0 && names.every((name) => isAnyAgent(name))
}

function summary(item: WorkItem) {
  const due = item.frontmatter.get('due')
  const owner = item.frontmatter.get('owner')
  return {
    id: item.id ?? null, title: titleOf(item), path: item.relPath,
    priority: Number.isFinite(priority(item)) ? priority(item) : null,
    due: typeof due === 'string' ? due : null,
    owner: typeof owner === 'string' ? owner : null,
    assignees: assignees(item),
    request: isRequest(item),
    roles: roleTags(getList(item.text, 'tags') ?? []),
    parent: item.parent,
  }
}

/**
 * Options are dispatchable when wi claim would accept the proposed agent. A card that only asks for
 * any agent is free to claim, and comes first. A card with any other assignee is taken.
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
    if (assignees(item).length > 0 && !isRequest(item)) reasons.push('claimed')
    const waits = openWaits(vault, item)
    if (waits.cards.length + waits.people.length > 0) reasons.push('dependency')
    const dependencies = dependenciesOf(vault, item)
    if (dependencies.unresolved.length > 0 || dependencies.malformed.length > 0) reasons.push('invalid-dependency')
    if (item.board && vault.childrenOf(item).some((child) =>
      child.status === 'doing' && (options.agent === undefined || !holds(assignees(child), options.agent)))) {
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

/** `wi ready`: the option cards a worker may claim now, in the order to take them. */
export const runReady: RunFunction = async (context, line) => {
  const vault = await context.vault()
  const { values } = line
  if (line.positionals.length > 1) throw new UsageError('wi ready takes no card reference.')
  const agent = values['assignee'] === undefined && values['holder'] === undefined
    ? undefined
    : singleLineOption(values, values['assignee'] === undefined ? 'holder' : 'assignee')
  const parent = typeof values['parent'] === 'string' ? values['parent'] : undefined
  const result = readyCards(vault, { ...(agent === undefined ? {} : { agent }), ...(parent === undefined ? {} : { parent }) })
  if (values['json'] === true) {
    context.out(json(result))
    return 0
  }
  context.out(`${result.counts.ready} ready card${result.counts.ready === 1 ? '' : 's'}\n`)
  for (const card of result.ready) context.out(`  ${card.id ?? '?'}  ${card.title}\n`)
  if (result.counts.excluded > 0) context.out(`${result.counts.excluded} option card${result.counts.excluded === 1 ? '' : 's'} excluded; use --json for reasons.\n`)
  return 0
}
