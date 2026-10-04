/**
 * The matching behind "Open work item…" and the `obsidian://recursive-board?id=` link. Pure, so
 * it is tested without Obsidian.
 *
 * A typed query matches a card by its id or its title. An id match ranks before a title match,
 * because an id is exact and a title is not. At the same match strength, open cards rank before
 * done and archived ones, since the card you look for is usually still open.
 */
import { idSuffix } from '../../shared/schema.ts'
import type { WorkItemMeta } from '../index.ts'

type Matchable = Pick<WorkItemMeta, 'id' | 'title' | 'status' | 'effectiveArchived'>

/** Match strengths, strongest first. */
const EXACT_ID = 0
const ID_PREFIX = 1
const TITLE_PREFIX = 2
const TITLE_PART = 3
const TITLE_WORDS = 4

const normalise = (text: string) => text.trim().toLowerCase()
const isClosed = (item: Matchable) => item.status === 'done' || item.effectiveArchived

function strength(item: Matchable, query: string, suffix: string, words: readonly string[]): number | null {
  const ownSuffix = item.id === undefined ? undefined : idSuffix(item.id.toLowerCase())
  if (ownSuffix !== undefined && suffix !== '') {
    if (ownSuffix === suffix) return EXACT_ID
    if (ownSuffix.startsWith(suffix)) return ID_PREFIX
  }
  const title = item.title.toLowerCase()
  if (title.startsWith(query)) return TITLE_PREFIX
  if (title.includes(query)) return TITLE_PART
  if (words.length > 1 && words.every((word) => title.includes(word))) return TITLE_WORDS
  return null
}

/**
 * The items that match the query, best first. An empty query lists the open items by title.
 * The query may be a full id (`wi-k7m3`), a bare suffix (`k7m3`), an id prefix, or part of a title.
 */
export function matchWorkItems<T extends Matchable>(items: readonly T[], query: string): T[] {
  const typed = normalise(query)
  if (typed === '') {
    return items.filter((item) => !isClosed(item)).sort((a, b) => a.title.localeCompare(b.title))
  }
  const suffix = idSuffix(typed)
  const words = typed.split(/\s+/)
  return items
    .flatMap((item) => {
      const rank = strength(item, typed, suffix, words)
      return rank === null ? [] : [{ item, rank }]
    })
    .sort((a, b) => a.rank - b.rank
      || Number(isClosed(a.item)) - Number(isClosed(b.item))
      || a.item.title.localeCompare(b.item.title))
    .map(({ item }) => item)
}

/**
 * The item that holds the id, given in full or as its bare suffix. Null when no item holds it.
 * `duplicates` lists any other items with the same id, so the caller can name the clash, as
 * `wi validate` does; the first item in index order is the one to open.
 */
export function findById<T extends Matchable>(items: readonly T[], id: string): { item: T; duplicates: T[] } | null {
  const suffix = idSuffix(normalise(id))
  if (suffix === '') return null
  const [item, ...duplicates] = items.filter((each) => each.id !== undefined && idSuffix(each.id.toLowerCase()) === suffix)
  return item === undefined ? null : { item, duplicates }
}
