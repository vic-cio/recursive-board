/** A complete read of one card for agents. This command never changes a vault file. */
import { getList } from '../../shared/frontmatter.ts'
import { bodyOf, listItems, section } from '../../shared/sections.ts'
import { dependenciesOf, titleOf } from '../dependencies.ts'
import { resolveRole } from '../../shared/authorship.ts'
import type { Vault, WorkItem } from '../vault.ts'

function stringField(item: WorkItem, key: string): string | null {
  const value = item.frontmatter.get(key)
  return typeof value === 'string' ? value : null
}

function numberField(item: WorkItem, key: string): number | null {
  const value = item.frontmatter.get(key)
  return typeof value === 'number' ? value : null
}

function identity(item: WorkItem) {
  return { id: item.id ?? null, title: titleOf(item), path: item.relPath }
}

function knowledgeLines(body: string): string[] {
  const text = section(body, 'Knowledge')
  if (text === null) return []
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^[-*+]\s*(?:\[[ xX]\]\s*)?$/.test(line))
}

/** The ancestors are root first. Broken links remain visible through ancestryIssue. */
function ancestryOf(vault: Vault, item: WorkItem) {
  const ancestors: WorkItem[] = []
  const seen = new Set([item.relPath])
  let current = item
  let issue: string | null = null
  while (current.parent !== null) {
    const parent = vault.resolveLink(current.parent)
    if (!parent) {
      issue = current.parent
      break
    }
    if (seen.has(parent.relPath)) {
      issue = `cycle at ${parent.relPath}`
      break
    }
    seen.add(parent.relPath)
    ancestors.push(parent)
    current = parent
  }
  if (issue === null && current.parentRaw !== undefined && current.parent === null) issue = current.parentRaw
  return { ancestors: ancestors.reverse(), issue }
}

export function showCard(vault: Vault, ref: string) {
  const item = vault.resolve(ref)
  const body = bodyOf(item.text)
  const dependencies = dependenciesOf(vault, item)
  const ancestry = ancestryOf(vault, item)
  const role = resolveRole(item.frontmatter.get('role'), ancestry.ancestors.slice().reverse()
    .map((ancestor) => ancestor.frontmatter.get('role')))
  const parent = item.parent === null ? undefined : vault.resolveLink(item.parent)
  const children = vault.childrenOf(item)
  return {
    ...identity(item),
    status: item.status ?? null,
    owner: stringField(item, 'owner'),
    agent: stringField(item, 'agent'),
    role: role.role ?? null,
    roleInherited: role.inherited,
    creator: stringField(item, 'creator'),
    creatorModel: stringField(item, 'creator_model'),
    priority: numberField(item, 'priority'),
    due: stringField(item, 'due'),
    created: stringField(item, 'created'),
    updated: stringField(item, 'updated'),
    tags: getList(item.text, 'tags') ?? [],
    parent: parent ? identity(parent) : null,
    parentIssue: item.parentRaw !== undefined && !parent ? item.parent ?? item.parentRaw : null,
    ancestryIssue: ancestry.issue,
    ancestry: ancestry.ancestors.map((ancestor) => ({
      ...identity(ancestor), objective: section(bodyOf(ancestor.text), 'Objective'),
    })),
    objective: section(body, 'Objective'),
    context: section(body, 'Context'),
    acceptanceCriteria: listItems(body, 'Acceptance Criteria'),
    notes: section(body, 'Notes'),
    knowledge: knowledgeLines(body),
    dependencies: dependencies.resolved.map((dependency) => ({
      ...identity(dependency), status: dependency.status ?? null,
      archived: vault.isArchived(dependency), satisfied: dependency.status === 'done',
    })),
    unresolvedDependencies: dependencies.unresolved,
    malformedDependencies: dependencies.malformed,
    children: {
      total: children.length,
      open: children.filter((child) => child.status !== 'done' && !vault.isArchived(child)).length,
      done: children.filter((child) => child.status === 'done' && !vault.isArchived(child)).length,
      items: children.map((child) => ({
        id: child.id ?? null, title: titleOf(child), status: child.status ?? null,
        archived: vault.isArchived(child),
      })),
    },
    board: item.board,
    area: item.area,
    archived: item.archived,
    effectiveArchived: vault.isArchived(item),
  }
}
