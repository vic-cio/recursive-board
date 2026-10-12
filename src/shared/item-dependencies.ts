/** Reads the dependencies of a work item in a loaded vault (docs/adr/0041-card-dependencies.md). */
import { sameName } from './assignee.ts'
import { dependencyEntry, dependsOnRaw, isOpenDependency } from './dependencies.ts'
import type { Vault, WorkItem } from './vault.ts'

export interface ItemDependencies {
  /** The raw list entries, for an edit that must keep them. */
  raw: string[]
  resolved: WorkItem[]
  /**
   * The people the card waits on, in file order, each once: a plain name, or a link to a person
   * (docs/adr/0085-people-live-in-the-plugin-data.md). A known person has the vault's spelling.
   */
  people: string[]
  /** Plain names that are in neither the people list nor a person note. Each still counts as a wait. */
  unknownPeople: string[]
  unresolved: string[]
  malformed: string[]
}

export function dependenciesOf(vault: Vault, item: WorkItem): ItemDependencies {
  return dependenciesIn(vault, item.text)
}

/** The dependencies a card's text names, resolved in a loaded vault. */
export function dependenciesIn(vault: Vault, text: string): ItemDependencies {
  const raw = dependsOnRaw(text)
  const resolved: WorkItem[] = []
  const people: string[] = []
  const unknownPeople: string[] = []
  const unresolved: string[] = []
  const malformed: string[] = []
  const addPerson = (name: string) => {
    if (!people.some((known) => sameName(known, name))) people.push(name)
  }
  for (const value of raw) {
    const entry = dependencyEntry(value)
    if (entry.kind === 'malformed') {
      malformed.push(entry.text)
      continue
    }
    if (entry.kind === 'person') {
      const known = vault.personCalled(entry.name)
      if (known === undefined && !unknownPeople.some((name) => sameName(name, entry.name))) unknownPeople.push(entry.name)
      addPerson(known ?? entry.name)
      continue
    }
    const found = vault.resolveLink(entry.target)
    if (found !== undefined) {
      if (!resolved.includes(found)) resolved.push(found)
      continue
    }
    const person = vault.personNamed(entry.target)
    if (person !== undefined) addPerson(person)
    else if (!unresolved.includes(entry.target)) unresolved.push(entry.target)
  }
  return { raw, resolved, people, unknownPeople, unresolved, malformed }
}

/** The cards this item still waits on. `text` is the card's text, when it is newer than the loaded copy. */
export function openDependencies(vault: Vault, item: WorkItem, text: string = item.text): WorkItem[] {
  return dependenciesIn(vault, text).resolved.filter(isOpenDependency)
}

/**
 * Everything the card still waits on: the open cards, and every person. A person wait stays open
 * until it is removed, so it never reads a status.
 */
export function openWaits(vault: Vault, item: WorkItem, text: string = item.text): { cards: WorkItem[]; people: string[] } {
  const waits = dependenciesIn(vault, text)
  return { cards: waits.resolved.filter(isOpenDependency), people: waits.people }
}

/** The items whose dependencies include this one. */
export function dependentsOf(vault: Vault, item: WorkItem): WorkItem[] {
  return vault.items.filter((other) => other !== item && dependenciesOf(vault, other).resolved.includes(item))
}

export function titleOf(item: WorkItem): string {
  return item.title ?? item.stem
}
