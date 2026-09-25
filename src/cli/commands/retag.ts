/**
 * `wi retag` and `wi graph`: keep area tags in step with the tree, and colour the graph by them
 * (docs/adr/0039-colour-the-graph-by-area.md).
 *
 * `wi move` and `wi area` change which area a subtree sits in, but they write one file each. The
 * tags under them go stale, `wi validate` warns, and `wi retag` rewrites each stale item on its own.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { editItem, writeAtomic } from '../write.ts'
import { getList } from '../../shared/frontmatter.ts'
import {
  areaColourGroups, areaTagFor, hasAreaTag, isAreaColourGroup, withAreaTag, type AreaNode,
} from '../../shared/area-tags.ts'
import type { Vault, WorkItem } from '../vault.ts'

function node(item: WorkItem): AreaNode {
  return { title: item.title ?? item.stem, area: item.area }
}

/** The item, then each ancestor up to the root. A looping chain stops where it repeats. */
export function chainOf(vault: Vault, item: WorkItem): AreaNode[] {
  const chain: AreaNode[] = []
  const seen = new Set<string>()
  for (let current: WorkItem | undefined = item; current; current = vault.resolveLink(current.parent)) {
    if (seen.has(current.relPath)) break
    seen.add(current.relPath)
    chain.push(node(current))
  }
  return chain
}

export function expectedAreaTag(vault: Vault, item: WorkItem): string | null {
  return areaTagFor(chainOf(vault, item))
}

export function tagsOf(item: WorkItem): string[] {
  return getList(item.text, 'tags') ?? []
}

export interface Stale {
  item: WorkItem
  from: string[]
  to: string[]
}

/** Items below the root whose area tag disagrees with the tree. */
export function staleAreaTags(vault: Vault): Stale[] {
  return vault.items.flatMap((item) => {
    if (!item.frontmatter.has('parent')) return []
    const tags = tagsOf(item)
    const tag = expectedAreaTag(vault, item)
    return hasAreaTag(tags, tag) ? [] : [{ item, from: tags, to: withAreaTag(tags, tag) }]
  })
}

function requireAreaTags(vault: Vault): void {
  if (!vault.config.areaTags) {
    throw new Error('area tags are off in this vault. Set "areaTags": true in .wi.json first.')
  }
}

export async function retag(vault: Vault, dryRun: boolean): Promise<Stale[]> {
  requireAreaTags(vault)
  const stale = staleAreaTags(vault)
  if (!dryRun) {
    for (const entry of stale) await editItem(entry.item, [{ op: 'list', key: 'tags', values: entry.to }])
  }
  return stale
}

export interface GraphWrite {
  path: string
  groups: number
  kept: number
}

/**
 * Writes one pair of colour groups per area into the graph settings. Groups the owner made stay,
 * after the area groups. Obsidian holds this file in memory while a graph is open and may write
 * over it, so run this with the graph closed.
 */
export async function writeGraphColours(vault: Vault, configDir = '.obsidian'): Promise<GraphWrite> {
  requireAreaTags(vault)
  const path = join(vault.root, configDir, 'graph.json')
  if (!existsSync(join(vault.root, configDir))) {
    throw new Error(`${configDir}/ is missing, so this vault has never been opened in Obsidian. Open it once, then retry.`)
  }
  let config: Record<string, unknown> = {}
  if (existsSync(path)) {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${configDir}/graph.json is not a JSON object. Nothing was written.`)
    }
    config = { ...parsed }
  }
  const tags = vault.items.flatMap((item) => {
    const tag = expectedAreaTag(vault, item)
    return tag === null ? [] : [tag]
  })
  const groups = areaColourGroups(tags)
  const existing = Array.isArray(config['colorGroups']) ? config['colorGroups'] as unknown[] : []
  const kept = existing.filter((group) => !isAreaColourGroup(group))
  config['colorGroups'] = [...groups, ...kept]
  await writeAtomic(path, `${JSON.stringify(config, null, 2)}\n`)
  return { path: `${configDir}/graph.json`, groups: groups.length, kept: kept.length }
}
