/**
 * Area tags and the graph colours they drive (docs/adr/0039-colour-the-graph-by-area.md).
 *
 * Every work item under an area carries one nested tag that names its areas from the top down:
 * `area/obsidian-development/recursive-board`. Obsidian's `tag:#area/obsidian-development` also
 * matches the nested tag, so one colour group can colour a whole family. The tag is derived from
 * the tree, so it is only ever rewritten to match it, never chosen.
 *
 * This module imports nothing from Node, so the plugin bundle carries it to iOS.
 */
import type { Edit } from './edits.ts'
import { getList } from './frontmatter.ts'
import { labelColour, type LabelColour } from './labels.ts'

export const AREA_TAG_PREFIX = 'area/'

export function isAreaTag(tag: string): boolean {
  return tag.replace(/^#/, '').toLowerCase().startsWith(AREA_TAG_PREFIX)
}

/** One tag segment from an area title: lower case, with every run of other characters a hyphen. */
export function areaSlug(title: string): string {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '')
  return slug === '' ? 'untitled' : slug
}

export interface AreaNode {
  title: string
  area: boolean
}

/**
 * The area tag for an item, from its chain: the item first, then its parent, up to the root.
 * Null when no item in the chain is an area.
 */
export function areaTagFor(chain: readonly AreaNode[]): string | null {
  const areas = chain.filter((node) => node.area).reverse()
  if (areas.length === 0) return null
  return `${AREA_TAG_PREFIX}${areas.map((node) => areaSlug(node.title)).join('/')}`
}

/** The tags with every area tag replaced by `tag`, or removed when it is null. Order is kept. */
export function withAreaTag(tags: readonly string[], tag: string | null): string[] {
  const kept = tags.filter((existing) => !isAreaTag(existing))
  return tag === null ? kept : [...kept, tag]
}

/** True when `tags` already hold exactly this area tag and no other. */
export function hasAreaTag(tags: readonly string[], tag: string | null): boolean {
  const current = tags.filter(isAreaTag).map((t) => t.replace(/^#/, ''))
  return tag === null ? current.length === 0 : current.length === 1 && current[0] === tag
}

/** The edit that gives the card's current tags this area tag, or null when they already hold it. */
export function areaTagEditsIn(text: string, tag: string | null): Edit[] | null {
  const tags = getList(text, 'tags') ?? []
  return hasAreaTag(tags, tag) ? null : [{ op: 'list', key: 'tags', values: withAreaTag(tags, tag) }]
}

export interface GraphColourGroup {
  query: string
  color: { a: number; rgb: number }
}

/** Obsidian's default values for the eight theme colours, as the graph stores them. */
const RGB: Record<LabelColour, number> = {
  red: 0xe93147, orange: 0xec7500, yellow: 0xe0ac00, green: 0x08b94e,
  cyan: 0x00bfbc, blue: 0x086ddd, purple: 0x7852ee, pink: 0xd53984,
}

/** Mix a colour towards white (positive) or black (negative) by `amount`, 0 to 1. */
function shade(rgb: number, amount: number): number {
  const target = amount >= 0 ? 255 : 0
  const mix = (channel: number) => Math.round(channel + (target - channel) * Math.abs(amount))
  return (mix((rgb >> 16) & 255) << 16) | (mix((rgb >> 8) & 255) << 8) | mix(rgb & 255)
}

/**
 * The colour groups for a set of area tags. The hue comes from the top area, derived as a label
 * colour is (docs/adr/0018-label-colours-are-derived.md), so a family shares one hue. Each level of
 * nesting is lighter. Boards and areas are darker than cards, so the structure shows.
 * The graph uses the first group that matches, so deeper areas come first, and boards before cards.
 */
export function areaColourGroups(tags: Iterable<string>): GraphColourGroup[] {
  const unique = [...new Set([...tags].map((t) => t.replace(/^#/, '')).filter(isAreaTag))]
  const depth = (tag: string) => tag.split('/').length - 1
  unique.sort((a, b) => depth(b) - depth(a) || a.localeCompare(b))
  return unique.flatMap((tag) => {
    const top = tag.split('/').slice(0, 2).join('/')
    const base = shade(RGB[labelColour(top)], Math.min(0.6, (depth(tag) - 1) * 0.3))
    return [
      { query: `tag:#${tag} ([board:true] OR [area:true])`, color: { a: 1, rgb: shade(base, -0.3) } },
      { query: `tag:#${tag}`, color: { a: 1, rgb: base } },
    ]
  })
}

/** True for a group this module wrote. Every other group is the owner's and is kept. */
export function isAreaColourGroup(group: unknown): boolean {
  if (typeof group !== 'object' || group === null || !('query' in group)) return false
  return typeof group.query === 'string' &&
    /^tag:#area\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*(?: \(\[board:true\] OR \[area:true\]\))?$/.test(group.query)
}
