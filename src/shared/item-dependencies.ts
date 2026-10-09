/** Reads the dependencies of a work item in a loaded vault (docs/adr/0041-card-dependencies.md). */
import { dependsOnRaw, isOpenDependency, parseDependsOn } from './dependencies.ts'
import type { Vault, WorkItem } from './vault.ts'

export interface ItemDependencies {
  /** The raw list entries, for an edit that must keep them. */
  raw: string[]
  resolved: WorkItem[]
  unresolved: string[]
  malformed: string[]
}

export function dependenciesOf(vault: Vault, item: WorkItem): ItemDependencies {
  return dependenciesIn(vault, item.text)
}

/** The dependencies a card's text names, resolved in a loaded vault. */
export function dependenciesIn(vault: Vault, text: string): ItemDependencies {
  const raw = dependsOnRaw(text)
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

/** The cards this item still waits on. `text` is the card's text, when it is newer than the loaded copy. */
export function openDependencies(vault: Vault, item: WorkItem, text: string = item.text): WorkItem[] {
  return dependenciesIn(vault, text).resolved.filter(isOpenDependency)
}

/** The items whose dependencies include this one. */
export function dependentsOf(vault: Vault, item: WorkItem): WorkItem[] {
  return vault.items.filter((other) => other !== item && dependenciesOf(vault, other).resolved.includes(item))
}

export function titleOf(item: WorkItem): string {
  return item.title ?? item.stem
}
