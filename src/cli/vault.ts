/**
 * The vault index.
 *
 * Reads `Boards/` and builds the index the CLI needs: items by id, items by filename stem, and
 * children by parent. Resolution follows decision D3: the wikilink is authoritative, so a parent
 * link resolves to a filename, never to a title and never to an id.
 *
 * The index also carries what it could not make sense of. An evicted iCloud file, a duplicate id,
 * a misplaced file: each is reported, and none causes an item to be dropped or repaired silently.
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve as resolvePath, dirname, basename, sep } from 'node:path'

import { parseFrontmatter, type Frontmatter } from '../shared/frontmatter.ts'
import {
  BOARDS, FOLDERS, WORK_ITEM_TYPE, isStatus, parseWikilink, type Status,
} from '../shared/schema.ts'

export interface WorkItem {
  /** Absolute path of the file. */
  path: string
  /** Path from the vault root, with forward slashes. */
  relPath: string
  /** Filename without the `.md`. This is what a wikilink resolves to. */
  stem: string
  id: string | undefined
  title: string | undefined
  status: Status | undefined
  /** The resolved target of the `parent` wikilink, or null when the item is a root. */
  parent: string | null
  /** The raw `parent` value, so a malformed one can be reported rather than guessed at. */
  parentRaw: string | undefined
  board: boolean
  frontmatter: Frontmatter
  text: string
}

export interface Vault {
  root: string
  items: WorkItem[]
  byId: Map<string, WorkItem>
  /** Work items whose id another work item also claims. */
  duplicateIds: string[]
  /** Files iCloud has evicted, given as the path of the real file they stand for. */
  evicted: string[]
  /** Markdown files that do not sit directly in one of the five folders. */
  misplaced: string[]
  /** Markdown files sitting in `Boards/` that are not work items. */
  nonItems: string[]
  takenIds: Set<string>
  takenStems: Set<string>
  /** Finds the item a wikilink target names, as Obsidian would. */
  resolveLink(target: string | null): WorkItem | undefined
  /** Finds an item by id, then by filename stem, then by title. Throws when nothing matches. */
  resolve(ref: string): WorkItem
  childrenOf(item: WorkItem): WorkItem[]
}

const MARKDOWN = /\.md$/i
/** iCloud evicts a file to a hidden sibling: `Notes.md` becomes `.Notes.md.icloud`. */
const ICLOUD_PLACEHOLDER = /^\.(.+)\.icloud$/

/** Walks up from a directory to the nearest vault, which is a folder holding `Boards/`. */
export function findVaultRoot(start: string): string | null {
  let dir = resolvePath(start)
  for (;;) {
    if (existsSync(join(dir, BOARDS))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

interface ScanResult {
  markdown: string[]
  evicted: string[]
  misplaced: string[]
}

async function scan(root: string): Promise<ScanResult> {
  const markdown: string[] = []
  const evicted: string[] = []
  const misplaced: string[] = []

  for (const folder of FOLDERS) {
    const dir = join(root, folder)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true, recursive: true })
    } catch {
      continue // A vault need not have every folder yet.
    }
    for (const entry of entries) {
      const parent = (entry.parentPath ?? dir).slice(root.length + 1).split(sep).join('/')
      const rel = `${parent}/${entry.name}`
      if (entry.isDirectory()) continue

      const placeholder = ICLOUD_PLACEHOLDER.exec(entry.name)
      if (placeholder) {
        const real = `${parent}/${placeholder[1]}`
        if (MARKDOWN.test(placeholder[1]!)) evicted.push(real)
        continue
      }
      if (!MARKDOWN.test(entry.name)) continue
      if (parent !== folder) {
        misplaced.push(rel) // D8: nothing nests inside the five folders.
        continue
      }
      markdown.push(rel)
    }
  }
  return { markdown, evicted, misplaced }
}

function toWorkItem(root: string, relPath: string, text: string): WorkItem | null {
  const frontmatter = parseFrontmatter(text)
  if (!frontmatter) return null
  if (frontmatter.get('type') !== WORK_ITEM_TYPE) return null

  const id = frontmatter.get('id')
  const title = frontmatter.get('title')
  const status = frontmatter.get('status')
  const parentRaw = frontmatter.get('parent')

  return {
    path: join(root, ...relPath.split('/')),
    relPath,
    stem: basename(relPath).replace(MARKDOWN, ''),
    id: typeof id === 'string' ? id : undefined,
    title: typeof title === 'string' && title !== '' ? title : undefined,
    status: isStatus(status) ? status : undefined,
    parent: parseWikilink(parentRaw),
    parentRaw: typeof parentRaw === 'string' ? parentRaw : undefined,
    board: frontmatter.get('board') === true,
    frontmatter,
    text,
  }
}

/**
 * Sibling order, per decision q6: `priority` ascending, then `updated` descending, then filename.
 * There is no `order` field in v1, so this is the whole of card ordering.
 */
function compareSiblings(a: WorkItem, b: WorkItem): number {
  const priority = (i: WorkItem) => {
    const value = i.frontmatter.get('priority')
    return typeof value === 'number' ? value : Number.POSITIVE_INFINITY
  }
  const updated = (i: WorkItem) => {
    const value = i.frontmatter.get('updated')
    return typeof value === 'string' ? value : ''
  }
  return (
    priority(a) - priority(b) ||
    updated(b).localeCompare(updated(a)) ||
    a.stem.localeCompare(b.stem)
  )
}

/** The last path segment of a wikilink target, lowercased. Obsidian resolves by filename. */
function linkKey(target: string): string {
  const last = target.split('/').pop() ?? target
  return last.replace(MARKDOWN, '').trim().toLowerCase()
}

/**
 * Refuses a write whose safety depends on seeing the whole tree, while iCloud has evicted any file.
 *
 * An evicted file is a stub whose frontmatter cannot be read, so the index cannot know its parent.
 * A parent can then look childless, and a loop can run through the stub unseen. Tested on
 * 2026-09-22: macOS 27 keeps an evicted file under its own name and downloads it on read, so this
 * fires only where iCloud still leaves `.icloud` stubs.
 */
export function requireWholeTree(vault: Vault, what: string): void {
  if (vault.evicted.length === 0) return
  const names = vault.evicted.slice(0, 3).join(', ')
  const more = vault.evicted.length > 3 ? `, and ${vault.evicted.length - 3} more` : ''
  throw new Error(
    `cannot ${what}: iCloud has evicted ${names}${more}, so the tree is not fully visible. ` +
    'Download them first (open the vault folder in Finder, or brctl download <path>).',
  )
}

export async function loadVault(root: string): Promise<Vault> {
  const { markdown, evicted, misplaced } = await scan(root)

  const items: WorkItem[] = []
  const nonItems: string[] = []
  for (const relPath of markdown) {
    if (!relPath.startsWith(`${BOARDS}/`)) continue
    const text = await readFile(join(root, ...relPath.split('/')), 'utf8')
    const item = toWorkItem(root, relPath, text)
    if (item) items.push(item)
    else nonItems.push(relPath)
  }
  nonItems.sort()
  items.sort((a, b) => a.relPath.localeCompare(b.relPath))

  const byId = new Map<string, WorkItem>()
  const duplicateIds: string[] = []
  for (const item of items) {
    if (item.id === undefined) continue
    if (byId.has(item.id)) duplicateIds.push(item.id)
    else byId.set(item.id, item)
  }

  const byStem = new Map<string, WorkItem>()
  for (const item of items) {
    const key = item.stem.toLowerCase()
    if (!byStem.has(key)) byStem.set(key, item)
  }

  const byTitle = new Map<string, WorkItem[]>()
  for (const item of items) {
    if (item.title === undefined) continue
    const key = item.title.toLowerCase()
    byTitle.set(key, [...(byTitle.get(key) ?? []), item])
  }

  const children = new Map<string, WorkItem[]>()
  for (const item of items) {
    if (item.parent === null) continue
    const key = linkKey(item.parent)
    if (!byStem.has(key)) continue // An orphan is a child of nobody. Report it; never repair it.
    children.set(key, [...(children.get(key) ?? []), item])
  }
  for (const siblings of children.values()) siblings.sort(compareSiblings)

  const resolveLink = (target: string | null) =>
    target === null ? undefined : byStem.get(linkKey(target))

  const resolve = (ref: string): WorkItem => {
    const trimmed = ref.trim()
    const byIdHit = byId.get(trimmed)
    if (byIdHit) return byIdHit
    const byStemHit = byStem.get(linkKey(trimmed))
    if (byStemHit) return byStemHit
    const byTitleHits = byTitle.get(trimmed.toLowerCase()) ?? []
    if (byTitleHits.length === 1) return byTitleHits[0]!
    if (byTitleHits.length > 1) {
      const options = byTitleHits.map((i) => `${i.id ?? '?'} (${i.relPath})`).join(', ')
      throw new Error(`"${ref}" matches ${byTitleHits.length} work items: ${options}. Use an id.`)
    }
    throw new Error(`no work item matches "${ref}". Try an id, a filename or a title.`)
  }

  return {
    root,
    items,
    byId,
    duplicateIds,
    evicted,
    misplaced,
    nonItems,
    takenIds: new Set(byId.keys()),
    takenStems: new Set(byStem.keys()),
    resolveLink,
    resolve,
    childrenOf: (item) => children.get(item.stem.toLowerCase()) ?? [],
  }
}
