/**
 * The `obsidian://recursive-board?vault=<vault>&id=wi-xxxx` link: which card it opens, and the
 * notice to show. Pure, so it is tested without Obsidian.
 */
import { findById } from './open-match.ts'
import type { WorkItemMeta } from '../index.ts'

type Matchable = Pick<WorkItemMeta, 'id' | 'title' | 'status' | 'effectiveArchived'>

/**
 * The card the link's `id` names, with or without `wi-`. A duplicate id opens the first card in
 * index order, and the notice names the clash, as `wi validate` does. No card means a notice only.
 */
export function openLinkTarget<T extends Matchable>(items: readonly T[], id: string | undefined): { item: T | null; notice: string | null } {
  const given = id?.trim() ?? ''
  const found = findById(items, given)
  if (found === null) {
    const notice = given === '' || given.toLowerCase() === 'wi-'
      ? 'The Recursive Board link names no card id.'
      : `No card has the id ${given}.`
    return { item: null, notice }
  }
  const { item, duplicates } = found
  if (duplicates.length === 0) return { item, notice: null }
  const titles = [item, ...duplicates].map((each) => each.title).join(', ')
  return {
    item,
    notice: `${duplicates.length + 1} cards have the id ${item.id}: ${titles}. Opened the first. Run wi validate to find them.`,
  }
}
