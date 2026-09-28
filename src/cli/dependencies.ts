/** Reads the dependencies of a work item in a loaded vault (docs/adr/0041-card-dependencies.md). */
import { DEPENDS_ON, isOpenDependency, parseDependsOn } from '../shared/dependencies.ts'
import { getList } from '../shared/frontmatter.ts'
import type { Vault, WorkItem } from './vault.ts'

export interface ItemDependencies {
  /** The raw list entries, for an edit that must keep them. */
  raw: string[]
  resolved: WorkItem[]
  unresolved: string[]
  malformed: string[]
}

export function dependenciesOf(vault: Vault, item: WorkItem): ItemDependencies {
  // One wikilink on the key line is a string, not a list to split on spaces as `tags` would be.
  const scalar = item.frontmatter.get(DEPENDS_ON)
  const raw = typeof scalar === 'string' ? [scalar] : getList(item.text, DEPENDS_ON) ?? []
  const { targets, malformed } = parseDependsOn(raw)
  const resolved: WorkItem[] = []
  const unresolved: string[] = []
  for (const target of targets) {
    const found = vault.resolveLink(target)
    if (found === undefined) unresolved.push(target)
    else if (!resolved.includes(found)) resolved.push(found)
  }
  return { raw, resolved, unresolved, malformed }
}

/** The cards this item still waits on. */
export function openDependencies(vault: Vault, item: WorkItem): WorkItem[] {
  return dependenciesOf(vault, item).resolved.filter(isOpenDependency)
}

/** The items whose dependencies include this one. */
export function dependentsOf(vault: Vault, item: WorkItem): WorkItem[] {
  return vault.items.filter((other) => other !== item && dependenciesOf(vault, other).resolved.includes(item))
}

export function titleOf(item: WorkItem): string {
  return item.title ?? item.stem
}
