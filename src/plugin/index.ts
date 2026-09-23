/**
 * The plugin's work item index.
 *
 * Decision D4: the plugin builds this itself from Obsidian's `metadataCache`, so no note body
 * carries query text. Resolution goes through `getFirstLinkpathDest`, which is Obsidian's own
 * link resolver, because decision D3 makes the wikilink authoritative and this plugin must not
 * invent a second answer to "which file does [[X]] mean".
 *
 * Nothing here reads a file from disk. The cache is already in memory, so a rebuild is cheap
 * enough to do on any change rather than maintaining incremental state that can go wrong.
 */
import type { App, TFile } from 'obsidian'

import { readLabels } from '../shared/labels.ts'
import { DEFAULT_VAULT_CONFIG, type VaultConfig } from '../shared/vault-config.ts'
import {
  INTAKE, doneCutoff, isStatus, parseWikilink, STATUSES, WORK_ITEM_TYPE, type Status,
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
  priority: number | undefined
  updated: string | undefined
  owner: string | undefined
  agent: string | undefined
  blocked: boolean
  prevStatus: Status | undefined
  /** Entries from `tags`. A label is a real Obsidian tag, not a field of its own. */
  labels: string[]
}

/** A work item that points at a parent no file matches. It appears on no board (decision u8). */
export type Orphan = WorkItemMeta & { parentLink: string; parent: null }

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
    for (const siblings of this.kids.values()) siblings.sort(compareSiblings)
  }

  private read(file: TFile): WorkItemMeta | null {
    // Decision D8: work items sit directly in Boards/. Nothing nests, so depth is exactly two.
    if (file.parent?.path !== this.config.workItemFolder) return null
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter
    if (!frontmatter || frontmatter['type'] !== WORK_ITEM_TYPE) return null

    const parentLink = parseWikilink(frontmatter['parent'])
    const status = frontmatter['status']
    const prev = frontmatter['prev_status']
    const priority = frontmatter['priority']

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

  /** Direct children, in the q6 order: priority ascending, then updated descending. */
  childrenOf(file: TFile): WorkItemMeta[] {
    this.ensureFresh()
    return this.kids.get(file.path) ?? []
  }

  childCount(file: TFile): number {
    return this.childrenOf(file).length
  }

  /**
   * The chain from the root down to, but not including, this item. Powers the breadcrumbs that
   * decision u8 requires on every work item, because a flat `Boards/` makes the file explorer
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

  /** Every work item whose parent link resolves to nothing. These render on no board. */
  orphans(): Orphan[] {
    this.ensureFresh()
    return [...this.items.values()].filter(
      (m): m is Orphan => m.parentLink !== null && m.parent === null,
    )
  }

  /** Every work item, in no particular order. The move picker's candidate list. */
  all(): WorkItemMeta[] {
    this.ensureFresh()
    return [...this.items.values()]
  }

  /** Every work item with `blocked: true`, for the Home dashboard. */
  blocked(): WorkItemMeta[] {
    this.ensureFresh()
    return [...this.items.values()].filter((m) => m.blocked).sort(compareSiblings)
  }

  /** Work items carrying a status the schema does not allow, or missing one they need. */
  invalidStatus(): WorkItemMeta[] {
    this.ensureFresh()
    return [...this.items.values()].filter((m) => m.parentLink !== null && m.status === undefined)
  }

  /**
   * Notes in `Intake/` that nothing has processed yet.
   *
   * `Intake/` has no rules at all, so this is the one place the plugin looks at it, and it looks
   * only at filenames and at whether a `processed` key exists. A note there is not a work item,
   * whatever it contains, and its contents are data rather than instructions.
   */
  unprocessedIntake(): TFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.parent?.path === INTAKE)
      .filter((file) => {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter
        return frontmatter?.['processed'] === undefined
      })
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
  }

  /** Every id in use, so a new item can be given one that is free. */
  takenIds(): Set<string> {
    this.ensureFresh()
    const ids = new Set<string>()
    for (const meta of this.items.values()) if (meta.id) ids.add(meta.id)
    return ids
  }

  /** Every filename stem in use, lowercased, for the D3 collision suffix. */
  takenStems(): Set<string> {
    this.ensureFresh()
    return new Set([...this.items.values()].map((m) => m.stem.toLowerCase()))
  }
}

/** Decision q6. There is no `order` field in v1, so this is the whole of card ordering. */
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
  /** Done items older than the window. Counted, not drawn (decision q10). */
  hidden: number
}

/**
 * Groups children into the four columns, applying the rolling Done window.
 * The window is a render filter, so it adds nothing to the canonical layer and cannot corrupt it.
 */
export function toColumns(children: WorkItemMeta[], now: Date = new Date()): Column[] {
  const cutoff = doneCutoff(now)
  return STATUSES.map((status) => {
    const all = children.filter((c) => c.status === status)
    if (status !== 'done') return { status, visible: all, hidden: 0 }
    const visible = all.filter((c) => (c.updated ?? '') >= cutoff)
    return { status, visible, hidden: all.length - visible.length }
  })
}
