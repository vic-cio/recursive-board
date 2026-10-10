/**
 * The vault index.
 *
 * Reads the configured work-item folder through a storage port and builds the index every
 * command needs: items by id, items by filename stem, and children by parent. Resolution follows
 * docs/adr/0002-work-item-identity-and-parent-links.md: the wikilink is authoritative, so a parent
 * link resolves to a filename, never to a title and never to an id.
 *
 * The index also carries what it could not make sense of. An unaccounted file, a duplicate id,
 * a misplaced file: each is reported, and none causes an item to be dropped or repaired silently.
 * This module imports nothing from Node (docs/adr/0076-a-storage-port-and-a-command-runner.md).
 */
import { getList, parseFrontmatter, type Frontmatter } from './frontmatter.ts'
import { roleTags, type TaggedNote } from './role-tags.ts'
import { type VaultConfig } from './vault-config.ts'
import { parsePluginData, PLUGIN_DATA_FILE, readBoardSettings } from './board-settings.ts'
import { archiveOwner } from './archive.ts'
import { peopleIn } from './delegate.ts'
import { dependsOnRaw, parseDependsOn } from './dependencies.ts'
import { readIfPresent, type StoragePort } from './storage.ts'
import {
  BOARDS, FOLDERS, WORK_ITEM_TYPE, isArea, isStatus, parseWikilink, type Status,
} from './schema.ts'

export interface WorkItem {
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
  area: boolean
  archived: boolean
  frontmatter: Frontmatter
  text: string
}

/** What a command reads the time and chance from, so a test can fix both. */
export interface VaultSeams {
  now(): Date
  random(): number
}

export interface Vault {
  /** The storage the vault was read from. Every write to it goes through the same port. */
  port: StoragePort
  seams: VaultSeams
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
  /**
   * The people a `depends_on` link can name: each note with `type: person`, keyed by the lower-case
   * name. It is read only when a card links to something that is not a work item, so a vault with
   * no person wait costs no scan.
   */
  people: ReadonlyMap<string, string>
  /** Finds the item a wikilink target names, as Obsidian would. */
  resolveLink(target: string | null): WorkItem | undefined
  /** The name of the person note a link target names, or undefined. A work item of that name wins. */
  personNamed(target: string | null): string | undefined
  /** Finds an item by id, filename stem, or title. Throws when the ref is missing or ambiguous. */
  resolve(ref: string): WorkItem
  childrenOf(item: WorkItem): WorkItem[]
  isArchived(item: WorkItem): boolean
}

/** The environment a command reads: wi passes process.env, the plugin a record of its own. */
export type Env = Readonly<Record<string, string | undefined>>

/** The environment is a per-run override for the vault's advisory dispatcher limit. */
export function maxAgentsForRun(vault: Vault, env: Env): number | null {
  const override = env['WI_MAX_AGENTS']
  if (override === undefined) return vault.config.maxAgents
  if (override.trim() === '') return null
  if (!/^\d+$/.test(override) || !Number.isSafeInteger(Number(override))) {
    throw new Error('WI_MAX_AGENTS must be a non-negative whole number.')
  }
  return Number(override)
}

const MARKDOWN = /\.md$/i

/** Folders a vault keeps for tools, never for notes. */
export const NOT_NOTES = new Set(['.obsidian', '.git', '.trash', 'node_modules'])

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

interface ScanResult {
  markdown: string[]
  unaccounted: string[]
  misplaced: string[]
}

async function scan(port: StoragePort, workItemFolder: string): Promise<ScanResult> {
  const markdown: string[] = []
  const unaccounted: string[] = []
  const misplaced: string[] = []

  for (const folder of [workItemFolder, ...FOLDERS.filter((name) =>
    name !== BOARDS && name !== workItemFolder && !workItemFolder.startsWith(`${name}/`))]) {
    let files
    try {
      files = await port.list(folder)
    } catch {
      continue // A vault need not have every folder yet.
    }
    for (const rel of files) {
      const slash = rel.lastIndexOf('/')
      const parent = rel.slice(0, slash)
      const name = rel.slice(slash + 1)

      if (folder === workItemFolder && isUnaccounted(name)) {
        unaccounted.push(rel)
        continue
      }
      if (!MARKDOWN.test(name)) continue
      if (parent !== folder) {
        misplaced.push(rel) // docs/adr/0003-flat-configurable-work-item-folder.md: work items stay flat.
        continue
      }
      markdown.push(rel)
    }
  }
  return { markdown, unaccounted, misplaced }
}

function toWorkItem(relPath: string, text: string): WorkItem | null {
  const frontmatter = parseFrontmatter(text)
  if (!frontmatter) return null
  if (frontmatter.get('type') !== WORK_ITEM_TYPE) return null

  const id = frontmatter.get('id')
  const title = frontmatter.get('title')
  const status = frontmatter.get('status')
  const parentRaw = frontmatter.get('parent')

  return {
    relPath,
    stem: relPath.slice(relPath.lastIndexOf('/') + 1).replace(MARKDOWN, ''),
    id: typeof id === 'string' ? id : undefined,
    title: typeof title === 'string' && title !== '' ? title : undefined,
    status: isStatus(status) ? status : undefined,
    parent: parseWikilink(parentRaw),
    parentRaw: typeof parentRaw === 'string' ? parentRaw : undefined,
    board: frontmatter.get('board') === true,
    area: isArea(frontmatter.get('area')),
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

/** A vault-relative path without its extension, normalized for link lookup. */
function pathKey(target: string): string {
  return target.replace(MARKDOWN, '').replaceAll('\\', '/').trim().replace(/^\/+|\/+$/g, '').toLowerCase()
}

/** The unqualified filename key, normalized for link lookup. */
function stemKey(target: string): string {
  return pathKey(target).split('/').pop() ?? pathKey(target)
}

function ambiguity(ref: string, items: WorkItem[]): Error {
  const options = items.map((item) => `${item.id ?? '?'} (${item.relPath})`).join(', ')
  return new Error(`"${ref}" matches ${items.length} work items: ${options}. Use a path or unique id.`)
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

/** Read settings without scanning or reading work item files (docs/adr/0050-board-settings-in-plugin-data.md). */
export async function readVaultConfig(port: StoragePort): Promise<VaultConfig> {
  const pluginText = await readIfPresent(port, PLUGIN_DATA_FILE)
  return readBoardSettings(pluginText === null ? null : parsePluginData(pluginText)).config
}

/** The clock and the chance a command uses when the caller fixes neither. */
export const REAL_SEAMS: VaultSeams = { now: () => new Date(), random: Math.random }

export async function loadVault(port: StoragePort, seams: VaultSeams = REAL_SEAMS): Promise<Vault> {
  const config = await readVaultConfig(port)
  const { markdown, unaccounted, misplaced } = await scan(port, config.workItemFolder)

  const items: WorkItem[] = []
  const nonItems: string[] = []
  for (const relPath of markdown) {
    if (!relPath.startsWith(`${config.workItemFolder}/`)) continue
    const text = await port.read(relPath)
    const item = toWorkItem(relPath, text)
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

  const byStem = new Map<string, WorkItem[]>()
  const byPath = new Map<string, WorkItem>()
  for (const item of items) {
    const key = stemKey(item.stem)
    byStem.set(key, [...(byStem.get(key) ?? []), item])
    byPath.set(pathKey(item.relPath), item)
  }

  const byTitle = new Map<string, WorkItem[]>()
  for (const item of items) {
    if (item.title === undefined) continue
    const key = item.title.toLowerCase()
    byTitle.set(key, [...(byTitle.get(key) ?? []), item])
  }

  const resolveLink = (target: string | null) => {
    if (target === null) return undefined
    const key = pathKey(target)
    if (key.includes('/')) return byPath.get(key)
    const matches = byStem.get(stemKey(target)) ?? []
    return matches.length === 1 ? matches[0] : undefined
  }

  // A `depends_on` link that is no work item may name a person. The scan runs only then.
  const linksBeyondItems = items.some((item) =>
    parseDependsOn(dependsOnRaw(item.text)).targets.some((target) => resolveLink(target) === undefined))
  const people = linksBeyondItems ? await readPeople(port) : new Map<string, string>()
  const personNamed = (target: string | null) =>
    target === null || resolveLink(target) !== undefined ? undefined : people.get(stemKey(target))

  const children = new Map<string, WorkItem[]>()
  for (const item of items) {
    if (item.parent === null) continue
    const parent = resolveLink(item.parent)
    if (!parent) continue // An orphan is a child of nobody. Report it; never repair it.
    children.set(parent.relPath, [...(children.get(parent.relPath) ?? []), item])
  }
  for (const siblings of children.values()) siblings.sort(compareSiblings)

  const resolve = (ref: string): WorkItem => {
    const trimmed = ref.trim()
    const normalized = pathKey(trimmed)
    if (normalized.includes('/')) {
      const byPathHit = byPath.get(normalized)
      if (byPathHit) return byPathHit
      throw new Error(`no work item matches "${ref}". Try an id, a filename or a title.`)
    }
    const hits = new Set<WorkItem>()
    for (const item of items) if (item.id === trimmed) hits.add(item)
    for (const item of byStem.get(stemKey(trimmed)) ?? []) hits.add(item)
    for (const item of byTitle.get(trimmed.toLowerCase()) ?? []) hits.add(item)
    if (hits.size === 1) return hits.values().next().value!
    if (hits.size > 1) throw ambiguity(ref, [...hits])
    throw new Error(`no work item matches "${ref}". Try an id, a filename or a title.`)
  }

  return {
    port,
    seams,
    config,
    items,
    byId,
    duplicateIds,
    unaccounted,
    misplaced,
    nonItems,
    takenIds: new Set(byId.keys()),
    takenStems: new Set(byStem.keys()),
    people,
    resolveLink,
    personNamed,
    resolve,
    childrenOf: (item) => children.get(item.relPath) ?? [],
    isArchived: (item) => archiveOwner(item, (current) => resolveLink(current.parent) ?? null, (current) => current.archived) !== null,
  }
}

/** Every Markdown note outside the tool folders, with its text. */
async function readNotes(port: StoragePort): Promise<{ path: string; text: string }[]> {
  const paths = (await port.list('', NOT_NOTES)).filter((path) =>
    MARKDOWN.test(path) && !path.split('/').some((part) => NOT_NOTES.has(part)))
  return Promise.all(paths.map(async (path) => ({ path, text: await port.read(path) })))
}

/**
 * Every note in the vault with its tags, for the role-tag lookup (docs/adr/0062-role-tags.md).
 * Only notes with at least one role tag are kept: the lookup needs no others.
 */
export async function readRoleTaggedNotes(port: StoragePort): Promise<TaggedNote[]> {
  const notes = (await readNotes(port)).map(({ path, text }): TaggedNote => ({
    path,
    tags: getList(text, 'tags') ?? [],
    workItem: parseFrontmatter(text)?.get('type') === WORK_ITEM_TYPE,
  }))
  return notes.filter((note) => roleTags(note.tags).length > 0)
}

/**
 * The people the vault knows: each note with `type: person`, in any folder, as the plugin reads
 * them (docs/adr/0058-delegate-a-card.md). A vault with no person note knows no one, so every claim
 * counts as an agent, as before.
 */
export async function readPeople(port: StoragePort): Promise<Map<string, string>> {
  return peopleIn((await readNotes(port)).map(({ path, text }) => ({ path, type: parseFrontmatter(text)?.get('type') })))
}
