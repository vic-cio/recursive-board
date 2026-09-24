/**
 * The plugin's work item index.
 *
 * The plugin builds the index from Obsidian's `metadataCache`, so no note body
 * carries query text. Resolution goes through `getFirstLinkpathDest`, which is Obsidian's own
 * link resolver, because docs/adr/0002-work-item-identity-and-parent-links.md makes the wikilink authoritative and this plugin must not
 * invent a second answer to "which file does [[X]] mean".
 *
 * Nothing here reads a file from disk. The cache is already in memory, so a rebuild is cheap
 * enough to do on any change rather than maintaining incremental state that can go wrong.
 */
import type { App, TFile } from 'obsidian'

import { readLabels } from '../shared/labels.ts'
import { DEFAULT_VAULT_CONFIG, type VaultConfig } from '../shared/vault-config.ts'
import { archiveOwner } from '../shared/archive.ts'
import {
  doneCutoff, isStatus, parseWikilink, STATUSES, WORK_ITEM_TYPE, type Status,
} from '../shared/schema.ts'

export interface WorkItemMeta {
  file: TFile
  /** Filename without `.md`. What a wikilink resolves to. */
  stem: string
  id: string | undefined
  title: string
  status: Status | undefined
  /** The raw wikilink target, or null when this item is a root. */
  parentLink: string | null
  /** The file the parent link resolves to, or null when the item is a root or an orphan. */
  parent: TFile | null
  board: boolean
  area: boolean
  archived: boolean
  /** Own flag or an ancestor's flag, computed by the index on each rebuild. */
  effectiveArchived: boolean
  priority: number | undefined
  updated: string | undefined
  owner: string | undefined
  agent: string | undefined
  blocked: boolean
  prevStatus: Status | undefined
  /** Entries from `tags`. A label is a real Obsidian tag, not a field of its own. */
  labels: string[]
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

export class WorkItemIndex {
  private readonly app: App
  config: VaultConfig
  private items = new Map<string, WorkItemMeta>()
  private kids = new Map<string, WorkItemMeta[]>()
  private dirty = true

  constructor(app: App, config: VaultConfig = DEFAULT_VAULT_CONFIG) {
    this.app = app
    this.config = config
  }

  setConfig(config: VaultConfig): void {
    this.config = config
    this.invalidate()
  }

  /** Marks the index stale. The next read rebuilds it. */
  invalidate(): void {
    this.dirty = true
  }

  private ensureFresh(): void {
    if (!this.dirty) return
    this.dirty = false
    this.items = new Map()
    this.kids = new Map()

    for (const file of this.app.vault.getMarkdownFiles()) {
      const meta = this.read(file)
      if (meta) this.items.set(file.path, meta)
    }
    for (const meta of this.items.values()) {
      if (!meta.parent) continue
      const siblings = this.kids.get(meta.parent.path) ?? []
      siblings.push(meta)
      this.kids.set(meta.parent.path, siblings)
    }
    for (const meta of this.items.values()) {
      meta.effectiveArchived = this.archiveOwner(meta) !== null
    }
    for (const siblings of this.kids.values()) siblings.sort(compareSiblings)
  }

  /** The nearest file whose flag hides this item. Used by the dimmed card's Unarchive action. */
  archiveOwner(meta: WorkItemMeta): WorkItemMeta | null {
    this.ensureFresh()
    const path = archiveOwner(
      meta.file.path,
      (key) => this.items.get(key)?.parent?.path ?? null,
      (key) => this.items.get(key)?.archived ?? false,
    )
    return path === null ? null : this.items.get(path) ?? null
  }

  private read(file: TFile): WorkItemMeta | null {
    // docs/adr/0003-flat-configurable-work-item-folder.md: work items sit directly in Boards/. Nothing nests, so depth is exactly two.
    if (file.parent?.path !== this.config.workItemFolder) return null
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter
    if (!frontmatter || frontmatter['type'] !== WORK_ITEM_TYPE) return null

    const parentLink = parseWikilink(frontmatter['parent'])
    const status: unknown = frontmatter['status']
    const prev: unknown = frontmatter['prev_status']
    const priority: unknown = frontmatter['priority']

    return {
      file,
      stem: file.basename,
      id: str(frontmatter['id']),
      title: str(frontmatter['title']) ?? file.basename,
      status: isStatus(status) ? status : undefined,
      parentLink,
      parent: parentLink
        ? this.app.metadataCache.getFirstLinkpathDest(parentLink, file.path)
        : null,
      board: frontmatter['board'] === true,
      area: frontmatter['area'] === true,
      archived: frontmatter['archived'] === true,
      effectiveArchived: false,
      priority: typeof priority === 'number' ? priority : undefined,
      updated: str(frontmatter['updated']),
      owner: str(frontmatter['owner']),
      agent: str(frontmatter['agent']),
      blocked: frontmatter['blocked'] === true,
      prevStatus: isStatus(prev) ? prev : undefined,
      labels: readLabels(frontmatter['tags']),
    }
  }

  /** The work item a file is, or null when the file is not one. */
  get(file: TFile | null): WorkItemMeta | null {
    if (!file) return null
    this.ensureFresh()
    return this.items.get(file.path) ?? null
  }

  isWorkItem(file: TFile | null): boolean {
    return this.get(file) !== null
  }

  /** Direct children, in priority and update order: priority ascending, then updated descending. */
  childrenOf(file: TFile): WorkItemMeta[] {
    this.ensureFresh()
    return this.kids.get(file.path) ?? []
  }

  childCount(file: TFile): number {
    return this.childrenOf(file).length
  }

  /**
   * The chain from the root down to, but not including, this item. Powers the breadcrumbs that
   * is shown on every work item, because a flat `Boards/` makes the file explorer
   * useless for navigation.
   */
  ancestorsOf(file: TFile): WorkItemMeta[] {
    this.ensureFresh()
    const chain: WorkItemMeta[] = []
    const seen = new Set<string>([file.path])
    let current = this.items.get(file.path)?.parent ?? null

    while (current) {
      if (seen.has(current.path)) break // Integrity rule 3. Never loop, even on a broken vault.
      seen.add(current.path)
      const meta = this.items.get(current.path)
      if (!meta) break
      chain.unshift(meta)
      current = meta.parent
    }
    return chain
  }

  /** Every work item, in no particular order. The move picker's candidate list. */
  all(): WorkItemMeta[] {
    this.ensureFresh()
    return [...this.items.values()]
  }

  /** Every id in use, so a new item can be given one that is free. */
  takenIds(): Set<string> {
    this.ensureFresh()
    const ids = new Set<string>()
    for (const meta of this.items.values()) if (meta.id) ids.add(meta.id)
    return ids
  }

  /** Every filename stem in use, lowercased, for the id collision suffix. */
  takenStems(): Set<string> {
    this.ensureFresh()
    return new Set([...this.items.values()].map((m) => m.stem.toLowerCase()))
  }
}

/** There is no explicit order field, so priority, update time, and filename determine card order. */
export function compareSiblings(a: WorkItemMeta, b: WorkItemMeta): number {
  return (
    (a.priority ?? Number.POSITIVE_INFINITY) - (b.priority ?? Number.POSITIVE_INFINITY) ||
    (b.updated ?? '').localeCompare(a.updated ?? '') ||
    a.stem.localeCompare(b.stem)
  )
}

export interface Column {
  status: Status
  visible: WorkItemMeta[]
  /** Done items older than the window. Counted, not drawn. */
  hidden: number
  archived: WorkItemMeta[]
}

export interface AreaSummary {
  meta: WorkItemMeta
  doingCount: number
}

/** Areas belong above the status groups; their count is their active Doing cards. */
export function toAreas(
  children: WorkItemMeta[],
  childrenOf: (area: WorkItemMeta) => WorkItemMeta[],
  showArchived = false,
): AreaSummary[] {
  return children
    .filter((child) => child.area && (showArchived || !child.effectiveArchived))
    .map((meta) => ({
      meta,
      doingCount: childrenOf(meta).filter((child) =>
        !child.area && child.status === 'doing' && (showArchived || !child.effectiveArchived),
      ).length,
    }))
}

/**
 * Groups children into the four columns, applying the rolling Done window.
 * The window is a render filter, so it adds nothing to the canonical layer and cannot corrupt it.
 */
export function toColumns(children: WorkItemMeta[], now: Date = new Date(), showArchived = false): Column[] {
  const cutoff = doneCutoff(now)
  const cards = children.filter((child) => !child.area)
  return STATUSES.map((status) => {
    const all = cards.filter((c) => c.status === status)
    const archived = all.filter((c) => c.effectiveArchived)
    const live = all.filter((c) => !c.effectiveArchived)
    if (status !== 'done') return { status, visible: showArchived ? all : live, hidden: 0, archived }
    const visible = live.filter((c) => (c.updated ?? '') >= cutoff)
    return { status, visible: showArchived ? all.filter((c) => c.effectiveArchived || (c.updated ?? '') >= cutoff) : visible, hidden: live.length - visible.length, archived }
  })
}
