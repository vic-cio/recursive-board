/**
 * The rows of the "Tags…" picker (docs/adr/0057-free-tags.md). Pure, so it is tested without Obsidian.
 *
 * The card's own tags come first and are checked, so choosing one removes it. The other tags in
 * use follow. Typed text that names no tag in use is offered as a new tag, or as a refusal when
 * the shared rule refuses it, such as an area tag.
 */
import { freeTag, tagsInUse } from '../../shared/tags.ts'

export type TagSuggestion =
  | { kind: 'tag'; tag: string; on: boolean }
  | { kind: 'new'; tag: string }
  | { kind: 'refused'; text: string; reason: string }

const key = (tag: string) => tag.trim().replace(/^#/, '').toLowerCase()

export function tagSuggestions(cardTags: readonly string[], inUse: readonly string[], query: string): TagSuggestion[] {
  const own = tagsInUse([cardTags])
  const ownKeys = new Set(own.map(key))
  const others = tagsInUse([inUse]).filter((tag) => !ownKeys.has(key(tag)))
  const typed = key(query)
  const rows = [
    ...own.map((tag) => ({ kind: 'tag' as const, tag, on: true })),
    ...others.map((tag) => ({ kind: 'tag' as const, tag, on: false })),
  ].filter((row) => key(row.tag).includes(typed))
  if (typed === '' || rows.some((row) => key(row.tag) === typed)) return rows
  try {
    return [{ kind: 'new', tag: freeTag(query) } as const, ...rows]
  } catch (error) {
    return [{ kind: 'refused', text: query.trim(), reason: error instanceof Error ? error.message : String(error) }, ...rows]
  }
}
