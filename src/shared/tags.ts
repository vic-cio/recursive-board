/**
 * Free tags: the tags a person or an agent chooses for a card (docs/adr/0057-free-tags.md).
 *
 * `wi tag` and the card menu's "Tags…" both go through this module, so they add, remove and
 * refuse the same tags. Old `area/` tags stay on existing cards until the owner chooses a cleanup.
 * Obsidian matches tags without regard to case, so `Design` and `#design` are one tag here too.
 *
 * This module imports nothing from Node, so the plugin bundle carries it to iOS.
 */
import type { Edit } from './edits.ts'
import { getList } from './frontmatter.ts'
import { isLegacyAreaTag, LEGACY_AREA_TAG_PREFIX } from './legacy-area-tag.ts'

/** Letters, numbers, `_`, `-` and `/`: the characters Obsidian reads as part of a tag. */
const TAG = /^[\p{L}\p{M}\p{N}_-]+(?:\/[\p{L}\p{M}\p{N}_-]+)*$/u

function key(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase()
}

/**
 * The tag as the card stores it: no `#`, no surrounding space. Throws for a legacy area tag, and for
 * text Obsidian would not read as one tag.
 */
export function freeTag(input: string): string {
  const tag = input.trim().replace(/^#/, '')
  // `area` alone is refused too: Obsidian's `tag:#area` also matches every area tag.
  if (isLegacyAreaTag(tag) || key(tag) === LEGACY_AREA_TAG_PREFIX.slice(0, -1)) {
    throw new Error(`"${tag}" is reserved for old area tags and cannot be changed with wi tag.`)
  }
  if (!TAG.test(tag) || /^[\p{N}/]+$/u.test(tag)) {
    throw new Error(`"${input.trim()}" is not a tag. Use letters, numbers, "_", "-" and "/", with no space.`)
  }
  return tag
}

/**
 * The tags with `tag` added at the end or removed. A tag the card already holds in another case
 * or with a `#` counts as the same tag. Every other entry and the order stay.
 */
export function withFreeTag(tags: readonly string[], tag: string, on: boolean): string[] {
  const has = tags.some((existing) => key(existing) === key(tag))
  if (on) return has ? [...tags] : [...tags, tag]
  return tags.filter((existing) => key(existing) !== key(tag))
}

/**
 * The edit that adds or removes a free tag on the card's current tags, or null when the card
 * already agrees. A rule for `editItem`, so a tag written since the cache was read stays.
 */
export function freeTagEditsIn(text: string, input: string, on: boolean): Edit[] | null {
  const tag = freeTag(input)
  const tags = getList(text, 'tags') ?? []
  const next = withFreeTag(tags, tag, on)
  if (next.length === tags.length && next.every((value, i) => value === tags[i])) return null
  return [{ op: 'list', key: 'tags', values: next }]
}

/** Every free tag on the given cards, once each in the first spelling seen, sorted. */
export function tagsInUse(lists: Iterable<readonly string[]>): string[] {
  const seen = new Map<string, string>()
  for (const tags of lists) {
    for (const raw of tags) {
      const tag = raw.trim().replace(/^#/, '')
      if (tag === '' || isLegacyAreaTag(tag) || seen.has(key(tag))) continue
      seen.set(key(tag), tag)
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
