/**
 * The vault index.
 *
 * Reads the configured work-item folder and builds the index the CLI needs: items by id, items by filename stem, and
 * children by parent. Resolution follows docs/adr/0002-work-item-identity-and-parent-links.md: the wikilink is authoritative, so a parent
 * link resolves to a filename, never to a title and never to an id.
 *
 * The index also carries what it could not make sense of. An unaccounted file, a duplicate id,
 * a misplaced file: each is reported, and none causes an item to be dropped or repaired silently.
 */
import { readdir, readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve as resolvePath, dirname, basename, sep, isAbsolute } from 'node:path'

import { parseFrontmatter, type Frontmatter } from '../shared/frontmatter.ts'
import { parseVaultConfig, WI_CONFIG_FILE, type VaultConfig } from '../shared/vault-config.ts'
import { archiveOwner } from '../shared/archive.ts'
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
  archived: boolean
  frontmatter: Frontmatter
  text: string
}

export interface Vault {
  root: string
  config: VaultConfig
  items: WorkItem[]
  byId: Map<string, WorkItem>
  /** Work items whose id another work item also claims. */
  duplicateIds: string[]
  /**
   * Hidden files in the work-item folder that are not Markdown. A sync client writes one while it
   * holds a file back, and anything else hidden there is a stray. Either way the contents were
   * not read, so the index may be missing a work item.
   */
  unaccounted: string[]
  /** Markdown files that do not sit directly in a product folder. */
  misplaced: string[]
  /** Markdown files in the work-item folder that are not work items. */
  nonItems: string[]
  takenIds: Set<string>
  takenStems: Set<string>
  /** Finds the item a wikilink target names, as Obsidian would. */
  resolveLink(target: string | null): WorkItem | undefined
  /** Finds an item by id, then by filename stem, then by title. Throws when nothing matches. */
  resolve(ref: string): WorkItem
  childrenOf(item: WorkItem): WorkItem[]
  isArchived(item: WorkItem): boolean
}

const MARKDOWN = /\.md$/i

export interface RepoPointer {
  vault: string
  board: string
}

function wiConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env['XDG_CONFIG_HOME']
  return xdg && isAbsolute(xdg) ? join(xdg, 'wi') : join(homedir(), '.config', 'wi')
}

function gitCommonDir(start: string): string | null {
  try {
    const output = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: start,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return realpathSync(resolvePath(start, output))
  } catch {
    return null
  }
}

async function readJsonObject(path: string, description: string): Promise<Record<string, unknown> | null> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`${description} must contain valid JSON.`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${description} must contain a JSON object.`)
  }
  return value as Record<string, unknown>
}

/** Returns this repository's pointer, shared by linked worktrees. */
export async function getRepoPointer(start: string, env: NodeJS.ProcessEnv = process.env): Promise<RepoPointer | null> {
  const commonDir = gitCommonDir(start)
  if (!commonDir) return null
  const map = await readJsonObject(join(wiConfigDir(env), 'repos.json'), 'wi repos.json')
  const value = map?.[commonDir]
  if (value === undefined) return null
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`wi repos.json: entry for ${commonDir} must contain vault and board strings.`)
  }
  const entry = value as Record<string, unknown>
  if (typeof entry['vault'] !== 'string' || typeof entry['board'] !== 'string') {
    throw new Error(`wi repos.json: entry for ${commonDir} must contain vault and board strings.`)
  }
  return { vault: entry['vault'], board: entry['board'] }
}

/** Stores the repo pointer in the user's config directory, never in the repository. */
export async function setRepoPointer(start: string, pointer: RepoPointer, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const commonDir = gitCommonDir(start)
  if (!commonDir) throw new Error('wi here must run inside a Git repository.')
  const dir = wiConfigDir(env)
  const path = join(dir, 'repos.json')
  const map = await readJsonObject(path, 'wi repos.json') ?? {}
  map[commonDir] = pointer
  await mkdir(dir, { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

/** Reads the fallback vault configured by `wi setup`, respecting XDG_CONFIG_HOME. */
export async function getDefaultVault(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const config = await readJsonObject(join(wiConfigDir(env), 'config.json'), 'wi config.json')
  return typeof config?.['defaultVault'] === 'string' ? config['defaultVault'] : null
}
/**
 * Hidden files that are known to be harmless, so they are never reported. The OS writes
 * `.DS_Store`, and `.gitkeep` is a common way to keep an empty folder in Git.
 */
const IGNORED_HIDDEN = new Set(['.DS_Store', '.localized', '.gitkeep'])

/**
 * docs/adr/0008-unaccounted-file-guard.md: a hidden file in the work-item folder that is not a Markdown file is unaccounted
 * for. A sync client that has not downloaded a file may leave a hidden stub beside it, for
 * example a sync service's `Boards/.Card.md.icloud`, and a stray hidden file is a second way for a work
 * item to be invisible to the index. Both are reported; neither is guessed at.
 */
function isUnaccounted(name: string): boolean {
  if (!name.startsWith('.')) return false
  if (MARKDOWN.test(name)) return false
  return !IGNORED_HIDDEN.has(name)
}

/** Walks up to the nearest configured vault, or a legacy vault holding `Boards/`. */
export function findVaultRoot(start: string): string | null {
  let dir = resolvePath(start)
  for (;;) {
    if (existsSync(join(dir, WI_CONFIG_FILE)) || existsSync(join(dir, BOARDS))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

interface ScanResult {
  markdown: string[]
  unaccounted: string[]
  misplaced: string[]
}

async function scan(root: string, workItemFolder: string): Promise<ScanResult> {
  const markdown: string[] = []
  const unaccounted: string[] = []
  const misplaced: string[] = []

  for (const folder of [workItemFolder, ...FOLDERS.filter((name) =>
    name !== BOARDS && name !== workItemFolder && !workItemFolder.startsWith(`${name}/`))]) {
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

      if (folder === BOARDS && isUnaccounted(entry.name)) {
        unaccounted.push(rel)
        continue
      }
      if (!MARKDOWN.test(entry.name)) continue
      if (parent !== folder) {
        misplaced.push(rel) // docs/adr/0003-flat-configurable-work-item-folder.md: work items stay flat.
        continue
      }
      markdown.push(rel)
    }
  }
  return { markdown, unaccounted, misplaced }
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
    archived: frontmatter.get('archived') === true,
    frontmatter,
    text,
  }
}

/**
 * Sibling order without an explicit order field: `priority` ascending, then `updated` descending, then filename.
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
 * Refuses a write whose safety depends on seeing the whole tree while a work-item folder file is
 * unaccounted for.
 *
 * An unaccounted file cannot be read, so the index cannot know whether a work item sits inside it.
 * A parent can then look childless, and a loop can run through the file unseen. That is why
 * `wi rm` and `wi move` refuse. There is no `--force` flag: docs/adr/0008-unaccounted-file-guard.md rejects one, because an
 * agent that meets a refusal reaches for the flag rather than reading the error.
 */
export function requireAccountedTree(vault: Vault, what: string): void {
  const files = vault.unaccounted
  if (files.length === 0) return
  const names = files.slice(0, 3).join(', ')
  const more = files.length > 3 ? `, and ${files.length - 3} more` : ''
  const one = files.length === 1
  throw new Error(
    `cannot ${what}: ${names}${more} ${one ? 'is' : 'are'} not accounted for, so the tree is ` +
    'not fully visible. Let the sync client download ' + (one ? 'it' : 'them') +
    ' if it is a work item, or delete it if it is a stray file, then retry.',
  )
}

export async function loadVault(root: string): Promise<Vault> {
  let configText: string | null = null
  try {
    configText = await readFile(join(root, WI_CONFIG_FILE), 'utf8')
  } catch (error) {
    if (!isMissingFile(error)) throw error
  }
  const config = parseVaultConfig(configText)
  const { markdown, unaccounted, misplaced } = await scan(root, config.workItemFolder)

  const items: WorkItem[] = []
  const nonItems: string[] = []
  for (const relPath of markdown) {
    if (!relPath.startsWith(`${config.workItemFolder}/`)) continue
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
    config,
    items,
    byId,
    duplicateIds,
    unaccounted,
    misplaced,
    nonItems,
    takenIds: new Set(byId.keys()),
    takenStems: new Set(byStem.keys()),
    resolveLink,
    resolve,
    childrenOf: (item) => children.get(item.stem.toLowerCase()) ?? [],
    isArchived: (item) => archiveOwner(item, (current) => resolveLink(current.parent) ?? null, (current) => current.archived) !== null,
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
