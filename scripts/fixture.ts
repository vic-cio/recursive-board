#!/usr/bin/env node
/**
 * Generates the dev fixture's `Boards/`.
 *
 * Generate the dev vault fixture from a script so its dates and awkward cases stay reproducible.
 *
 * Every file goes through `renderWorkItem`, the renderer both writers use, so the fixture cannot
 * disagree with what `wi new` and the add row produce. Dates are relative to today, so the
 * fourteen-day Done window always has an item inside it and one outside it; fixed dates would
 * slowly age every done item out of view. That makes the output change daily, so `test/Boards/`
 * is generated rather than committed.
 *
 * The awkward cases, each deliberate:
 * - an orphan, whose parent resolves to nothing: the one validation error;
 * - an unknown frontmatter key: the one warning;
 * - two items titled "Authentication", so the second takes the id collision suffix;
 * - a title long enough to wrap;
 * - a done item outside the window, and one inside it;
 * - a waiting item, a held item, a card with two holders, a request for any agent, an old card
 *   that names its holder in agent, labels, priorities and two promoted boards;
 * - a backlog area, and live areas at two depths, for the root board's area chips.
 *
 * Usage: node scripts/fixture.ts [--vault test]
 *
 * A second mode, `--review`, writes a clean review set into any Obsidian vault: the cards a person
 * looks at to check the board UI by eye. Each card's title says what to look at. The set has no
 * orphan and no unknown key, so `wi validate` reports 0 errors and 0 warnings. It replaces only
 * what it owns (see `writeReview`) and refuses a path that has no `.obsidian` folder.
 *
 * Usage: node scripts/fixture.ts --review --vault <path>
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderWorkItem } from '../src/shared/work-item.ts'
import { parseFrontmatter } from '../src/shared/frontmatter.ts'
import { fileNameFor, parseWikilink, today, type Status } from '../src/shared/schema.ts'
import type { Brief } from '../src/shared/templates.ts'

export interface Spec {
  id: string
  title: string
  /** The parent's title, which is also its filename stem unless it collided. Omit for the root. */
  parent?: string
  status?: Status
  /** Days before today. */
  created: number
  updated: number
  owner?: string
  /** Who does the work. `agent` asks for any agent. */
  holders?: string[]
  priority?: number
  tags?: string[]
  board?: boolean
  area?: boolean
  /** Titles of the cards, or names of the people, that the card waits on. */
  dependsOn?: string | readonly string[]
  prevStatus?: Status
  /** Frontmatter lines outside the schema, written as given. */
  unknown?: string[]
  body?: string
  /** The objective, context and criteria that `renderWorkItem` writes into the body. */
  brief?: Brief
}

const OBJECTIVE = (text: string) => `## Objective\n\n${text}\n`

export const SPECS: Spec[] = [
  { id: 'wi-0001', title: 'Main', created: 30, updated: 0, board: true,
    body: 'The root board. A root is a work item with no `parent`, and it takes no `status`.\n' },

  { id: 'wi-0002', title: 'Ship the mobile app', parent: 'Main', status: 'doing', created: 30,
    updated: 1, owner: 'sam', priority: 1, tags: ['app', 'infra'],
    body: `${OBJECTIVE('Create a mobile app interface so work items can trigger agent runs and show live output.')}
## Acceptance Criteria

- The app can connect over a secure network
- terminal output streams live
- commands can be submitted remotely
- reconnection does not duplicate sessions
` },
  { id: 'wi-0003', title: 'Research mobile constraints', parent: 'Ship the mobile app',
    status: 'done', prevStatus: 'doing', created: 20, updated: 3 },
  { id: 'wi-0009', title: 'Pick a sync library', parent: 'Ship the mobile app',
    status: 'done', prevStatus: 'options', created: 12, updated: 9 },
  // Outside the fourteen-day window: counted on the board, never drawn.
  { id: 'wi-0010', title: 'Sketch the board layout', parent: 'Ship the mobile app',
    status: 'done', created: 100, updated: 90 },
  { id: 'wi-0011', title: 'Draft the spec', parent: 'Ship the mobile app', status: 'done',
    created: 140, updated: 120 },
  { id: 'wi-0008', title: 'Build mobile UI', parent: 'Ship the mobile app', status: 'options',
    created: 30, updated: 2, tags: ['mobile'] },
  { id: 'wi-0004', title: 'Build server', parent: 'Ship the mobile app', status: 'backlog',
    created: 30, updated: 1, owner: 'sam', board: true,
    body: OBJECTIVE('A server the mobile app can reach over a secure network.') },
  { id: 'wi-0005', title: 'Authentication', parent: 'Build server', status: 'backlog',
    created: 30, updated: 5 },
  { id: 'wi-0006', title: 'Session management', parent: 'Build server', status: 'backlog',
    created: 30, updated: 4, dependsOn: 'Authentication',
    // A card written before the rename to holder: its agent is read as its holder.
    unknown: ['agent: codex'],
    body: OBJECTIVE('Track app sessions so a reconnect attaches rather than spawning a duplicate.') },
  { id: 'wi-0007', title: 'Streaming', parent: 'Build server', status: 'options', created: 30,
    updated: 1, holders: ['codex'], priority: 1,
    body: OBJECTIVE('Stream command and agent output to the app.') },

  { id: 'wi-0013', title: 'Marketing site', parent: 'Main', status: 'backlog', created: 10,
    updated: 2, owner: 'sam', priority: 2, tags: ['web', 'design'], board: true,
    body: OBJECTIVE('A second, unrelated branch of work, so the board is not one tall tree.') },
  // The same title as wi-0005 under another parent. `fileNameFor` gives it the id suffix.
  { id: 'wi-b2e1', title: 'Authentication', parent: 'Marketing site', status: 'backlog',
    created: 10, updated: 2 },
  // A person and an agent hold it at once: the card face shows S+1.
  { id: 'wi-0015', title: 'Product pages', parent: 'Marketing site', status: 'doing',
    created: 10, updated: 1, tags: ['design'], holders: ['sam', 'codex-pages'] },


  { id: 'wi-0012', title: 'Improve knowledge system', parent: 'Main', status: 'backlog',
    created: 30, updated: 6, owner: 'sam', priority: 3, tags: ['knowledge'],
    unknown: ['trello_card: sample-card'],
    body: `${OBJECTIVE('Improve how reference information is organized and maintained.')}
## Notes

This item carries an unknown frontmatter key. It tests that unknown keys survive every read and
write untouched.
` },
  { id: 'wi-0016', title: 'Orphaned research spike', parent: 'Build a prototype',
    status: 'doing', created: 50, updated: 40,
    body: OBJECTIVE('Points at a parent that no file matches. It appears on no board and must never be deleted for it.') },
  { id: 'wi-0017', title: 'Handle a work item with a very long title that will certainly wrap onto more than one line',
    parent: 'Main', status: 'backlog', created: 2, updated: 2 },
  { id: 'wi-0018', title: 'Improve the live preview', parent: 'Main', status: 'doing', created: 1,
    updated: 0, priority: 1, tags: ['plugin', 'urgent'] },
  { id: 'wi-0019', title: 'Review card text styles', parent: 'Main', status: 'backlog', created: 1,
    updated: 1, tags: ['design', 'plugin'] },
  { id: 'wi-0020', title: 'Explore a command wrapper', parent: 'Main', status: 'options', created: 1,
    updated: 1, holders: ['agent'] },
  { id: 'wi-0021', title: 'Operations', parent: 'Main', area: true, status: 'backlog', created: 5, updated: 2,
    body: OBJECTIVE('An ongoing space for work that does not have a definition of done.') },
  // Live areas at two depths, so the root board draws a row of chips: one directly under the root,
  // one inside a project board, which shows no chip of its own.
  { id: 'wi-0022', title: 'Home', parent: 'Main', area: true, status: 'doing', created: 5, updated: 1,
    body: OBJECTIVE('A live area that is a direct child of the root.') },
  { id: 'wi-0023', title: 'Fix the gutter', parent: 'Home', status: 'doing', created: 3, updated: 1 },
  { id: 'wi-0024', title: 'Content', parent: 'Marketing site', area: true, status: 'options', created: 5,
    updated: 2, body: OBJECTIVE('A live area two levels below the root.') },
]

function daysAgo(days: number, now: Date): string {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return today(date)
}

/**
 * Keys outside what `renderWorkItem` writes, appended before the frontmatter closes. `stemOf`
 * turns the title of a card into its filename stem, which is what a wikilink resolves to.
 */
function extraLines(spec: Spec, stemOf: (title: string) => string): string[] {
  const lines: string[] = []
  if (spec.tags) lines.push(`tags: [${spec.tags.join(', ')}]`)
  if (spec.board) lines.push('board: true')
  const waits = typeof spec.dependsOn === 'string' ? [spec.dependsOn] : spec.dependsOn ?? []
  if (waits.length === 1) lines.push(`depends_on: "[[${stemOf(waits[0]!)}]]"`)
  else if (waits.length > 1) lines.push('depends_on:', ...waits.map((name) => `  - "[[${stemOf(name)}]]"`))
  if (spec.prevStatus) lines.push(`prev_status: ${spec.prevStatus}`)
  return [...lines, ...(spec.unknown ?? [])]
}

/** The root has no parent and no status, which `renderWorkItem` does not write. */
function renderRoot(spec: Spec, now: Date, stemOf: (title: string) => string): string {
  const lines = [
    'type: work-item', `id: ${spec.id}`, `title: ${spec.title}`,
    `created: ${daysAgo(spec.created, now)}`, `updated: ${daysAgo(spec.updated, now)}`,
    ...(spec.owner ? [`owner: ${spec.owner}`] : []),
    ...extraLines(spec, stemOf),
  ]
  return `---\n${lines.join('\n')}\n---\n\n${spec.body ?? ''}`
}

function render(spec: Spec, parentStem: string, now: Date, stemOf: (title: string) => string): string {
  const common = {
    id: spec.id,
    title: spec.title,
    parentStem,
    owner: spec.owner,
    holders: spec.holders,
    priority: spec.priority,
    created: daysAgo(spec.created, now),
    updated: daysAgo(spec.updated, now),
    brief: spec.brief,
  }
  const text = renderWorkItem(spec.area
    ? { ...common, area: true, status: spec.status ?? 'backlog', template: 'area' }
    : { ...common, status: spec.status ?? 'backlog' })
  const close = text.indexOf('\n---\n', 4)
  const extra = extraLines(spec, stemOf)
  const head = extra.length > 0 ? `${text.slice(0, close)}\n${extra.join('\n')}` : text.slice(0, close)
  const body = spec.body ?? text.slice(close + 5).replace(/^\n/, '')
  return `${head}\n---\n\n${body}`
}

/** Renders the specs into files, keyed by path inside the vault. */
function generateFrom(specs: readonly Spec[], now: Date): Map<string, string> {
  const files = new Map<string, string>()
  const taken = new Set<string>()
  const stemOfTitle = new Map<string, string>()
  const stems = new Map<Spec, string>()

  for (const spec of specs) {
    const stem = fileNameFor(spec.title, spec.id, taken)
    taken.add(stem.toLowerCase())
    stems.set(spec, stem)
    // The first item with a title is what a parent reference by title means.
    if (!stemOfTitle.has(spec.title)) stemOfTitle.set(spec.title, stem)
  }
  // A name that is no title is a person, whose note is named by the name itself.
  const stemOf = (title: string) => stemOfTitle.get(title) ?? title

  for (const spec of specs) {
    const parentStem = spec.parent === undefined ? null : stemOf(spec.parent)
    const text = parentStem === null ? renderRoot(spec, now, stemOf) : render(spec, parentStem, now, stemOf)
    files.set(`Boards/${stems.get(spec)!}.md`, text)
  }
  return files
}

/** Returns the files it would write, keyed by path inside the vault. */
export function generate(now: Date = new Date()): Map<string, string> {
  return generateFrom(SPECS, now)
}

/** Replaces the vault's `Boards/` with the generated set when every Markdown item is fixture-owned. */
export async function writeFixture(vault: string, now: Date = new Date()): Promise<number> {
  const boards = join(vault, 'Boards')
  await mkdir(boards, { recursive: true })
  const fixtureIds = new Set(SPECS.map(({ id }) => id))
  const names = await readdir(boards)
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const text = await readFile(join(boards, name), 'utf8')
    const id = parseFrontmatter(text)?.get('id')
    if (typeof id !== 'string' || !fixtureIds.has(id)) {
      throw new Error(`refusing to replace work item with id ${String(id ?? '<missing>')}`)
    }
  }
  for (const name of names) {
    if (name.endsWith('.md')) await rm(join(boards, name))
  }
  const files = generate(now)
  for (const [path, text] of files) await writeFile(join(vault, path), text, 'utf8')
  return files.size
}

// The review set. Each title says what to look at, so a person checks the board UI by eye.

const REVIEW_ROOT_ID = 'wi-test'
const REVIEW_PEOPLE = ['Victor', 'Sam'] as const

/** All dated today. The set has no done window to test, so it needs no spread of dates. */
const NOW = { created: 0, updated: 0 }

export const REVIEW_SPECS: Spec[] = [
  { id: REVIEW_ROOT_ID, title: 'Test board', ...NOW, board: true, owner: 'Victor',
    body: OBJECTIVE('A throwaway board for checking Recursive Board UI changes by eye. Each card\'s title says what to look at.') },

  // Backlog: one chip kind at a time, plus long text.
  { id: 'wi-rv01', title: 'Chips: none', parent: 'Test board', status: 'backlog', ...NOW },
  { id: 'wi-rv02', title: 'Chips: priority only', parent: 'Test board', status: 'backlog', ...NOW, priority: 2 },
  { id: 'wi-rv03', title: 'Chips: owner only. Hover says Owner Victor', parent: 'Test board',
    status: 'backlog', ...NOW, owner: 'Victor' },
  // A first child promotes its parent to a board, as `wi new` does.
  { id: 'wi-rv04', title: 'Chips: child count only', parent: 'Test board', status: 'backlog', ...NOW,
    board: true },
  { id: 'wi-rv05', title: 'Child A', parent: 'Chips: child count only', status: 'backlog', ...NOW },
  { id: 'wi-rv06', title: 'Child B', parent: 'Chips: child count only', status: 'doing', ...NOW },
  { id: 'wi-rv07', title: 'A long title that wraps onto a second line, so the chips under it can be checked against two lines of text',
    parent: 'Test board', status: 'backlog', ...NOW, owner: 'Victor', priority: 3, tags: ['bug', 'ui'] },
  { id: 'wi-rv08', title: 'Labels: several at once', parent: 'Test board', status: 'backlog', ...NOW,
    tags: ['bug', 'ui', 'design', 'docs', 'needs-review'] },

  // Options: waits on a card, on a person, and on both.
  { id: 'wi-rv09', title: 'Waits on a card (Chips: none)', parent: 'Test board', status: 'options', ...NOW,
    dependsOn: 'Chips: none' },
  { id: 'wi-rv10', title: 'Waits on a person (Victor)', parent: 'Test board', status: 'options', ...NOW,
    dependsOn: 'Victor' },
  { id: 'wi-rv11', title: 'Waits on a card and a person', parent: 'Test board', status: 'options', ...NOW,
    dependsOn: ['Chips: none', 'Sam'] },

  // Doing: every chip at once, then the holders.
  { id: 'wi-rv12', title: 'Chips: every kind at once', parent: 'Test board', status: 'doing', ...NOW,
    owner: 'Victor', priority: 1, tags: ['bug', 'ui'], holders: ['claude', 'Victor'],
    dependsOn: 'Chips: none', board: true,
    brief: {
      objective: 'Check that every chip on this card face has the same height and that the row reads as one line.',
      context: ['A child count, priority, a wait, an owner or holder initial, and two labels all show here.'],
      criteria: [
        'The child count and the hourglass chip are the same height.',
        'The holder chip shows an initial and +1.',
      ],
    } },
  { id: 'wi-rv13', title: 'Chips-card child 1', parent: 'Chips: every kind at once', status: 'backlog', ...NOW },
  { id: 'wi-rv14', title: 'Chips-card child 2', parent: 'Chips: every kind at once', status: 'backlog', ...NOW },
  { id: 'wi-rv15', title: 'Chips-card child 3', parent: 'Chips: every kind at once', status: 'backlog', ...NOW },
  { id: 'wi-rv16', title: 'Assigned to an agent (claude)', parent: 'Test board', status: 'doing', ...NOW,
    holders: ['claude'] },
  { id: 'wi-rv17', title: 'Assigned to a person (Victor)', parent: 'Test board', status: 'doing', ...NOW,
    holders: ['Victor'] },
  { id: 'wi-rv18', title: 'Assigned to two (claude and Victor)', parent: 'Test board', status: 'doing', ...NOW,
    holders: ['claude', 'Victor'] },
  { id: 'wi-rv19', title: 'Assigned to any agent', parent: 'Test board', status: 'doing', ...NOW,
    holders: ['agent'] },

  // Done.
  { id: 'wi-rv20', title: 'A finished card', parent: 'Test board', status: 'done', ...NOW },
  { id: 'wi-rv21', title: 'Another finished card', parent: 'Test board', status: 'done', ...NOW, owner: 'Victor' },

  // An area with children.
  { id: 'wi-rv22', title: 'Area: Website', parent: 'Test board', status: 'doing', ...NOW, area: true },
  { id: 'wi-rv23', title: 'Area child 1', parent: 'Area: Website', status: 'backlog', ...NOW },
  { id: 'wi-rv24', title: 'Area child 2', parent: 'Area: Website', status: 'doing', ...NOW },
]

function personNote(name: string): string {
  return `---\ntype: person\ndescription: "${name}, a test person."\n---\n`
}

/** Returns the review set's files, keyed by path inside the vault: the cards and the two people. */
export function generateReview(now: Date = new Date()): Map<string, string> {
  const files = generateFrom(REVIEW_SPECS, now)
  for (const name of REVIEW_PEOPLE) files.set(`People/${name}.md`, personNote(name))
  return files
}

/**
 * The file names in `Boards/` that the review set owns, which it may replace. Anything else stops
 * the write. A card is the set's when its id is one of the set's, or when its `parent` chain
 * reaches the review root: that is what a card made under the test board by `wi new` looks like,
 * whatever its random id. The rule reads no file outside `Boards/` and removes none that it did
 * not name here.
 */
async function ownedBoardFiles(boards: string): Promise<string[]> {
  const reviewIds = new Set(REVIEW_SPECS.map(({ id }) => id))
  const cards = new Map<string, { name: string; id: unknown; parent: string | null }>()
  for (const name of (await readdir(boards)).filter((entry) => entry.endsWith('.md'))) {
    const fm = parseFrontmatter(await readFile(join(boards, name), 'utf8'))
    const parent = parseWikilink(fm?.get('parent'))
    cards.set(name.slice(0, -'.md'.length).toLowerCase(), { name, id: fm?.get('id'), parent })
  }
  const owned = (card: { id: unknown; parent: string | null }): boolean => {
    const seen = new Set<unknown>()
    let at: { id: unknown; parent: string | null } | undefined = card
    while (at !== undefined && !seen.has(at)) {
      if (typeof at.id === 'string' && reviewIds.has(at.id)) return true
      seen.add(at)
      at = at.parent === null ? undefined : cards.get(at.parent.toLowerCase())
    }
    return false
  }
  const owns: string[] = []
  for (const card of cards.values()) {
    if (!owned(card)) {
      throw new Error(`refusing to replace Boards/${card.name}: it has id ${String(card.id ?? '<missing>')}, and the review set did not write it`)
    }
    owns.push(card.name)
  }
  return owns
}

/**
 * Writes the review set into the vault and returns how many work items it wrote.
 *
 * The mode replaces only files it owns, and checks everything before it changes anything:
 * - the path must hold a `.obsidian` folder, so a mistyped path never gains a `Boards/`;
 * - a work item in `Boards/` is replaced when it is the set's, by id or by a `parent` chain to the
 *   review root; any other work item, or a file with no id, stops the write;
 * - `People/Victor.md` and `People/Sam.md` are replaced only when they hold the text this mode
 *   writes. They carry no id, so the exact text is what says the mode wrote them. Any other note
 *   in `People/` stays.
 * The dev fixture's rule, an id in its own set, cannot cover the people, and it cannot cover a
 * card made under the test board with `wi new`. These two additions are the smallest rule that can.
 */
export async function writeReview(vault: string, now: Date = new Date()): Promise<number> {
  const isVault = await stat(join(vault, '.obsidian')).then((info) => info.isDirectory(), () => false)
  if (!isVault) {
    throw new Error(`refusing to write the review set into ${vault}: it has no .obsidian folder, so it is not an Obsidian vault`)
  }
  const files = generateReview(now)
  const boards = join(vault, 'Boards')
  const people = join(vault, 'People')
  const owned = await readdir(boards).then(() => ownedBoardFiles(boards), (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  for (const name of REVIEW_PEOPLE) {
    const text = await readFile(join(people, `${name}.md`), 'utf8').catch(() => undefined)
    if (text !== undefined && text !== files.get(`People/${name}.md`)) {
      throw new Error(`refusing to replace People/${name}.md: the review set did not write it`)
    }
  }
  await mkdir(boards, { recursive: true })
  await mkdir(people, { recursive: true })
  for (const name of owned) await rm(join(boards, name))
  for (const [path, text] of files) await writeFile(join(vault, path), text, 'utf8')
  return REVIEW_SPECS.length
}

/** Runs the command line and returns what to print. */
export async function main(argv: readonly string[]): Promise<string> {
  const i = argv.indexOf('--vault')
  const given = i === -1 ? undefined : argv[i + 1]
  if (argv.includes('--review')) {
    if (given === undefined || given === '' || given.startsWith('--')) {
      throw new Error('--review needs --vault <path>. It has no default, so it never touches a vault by accident.')
    }
    const vault = resolve(given)
    const count = await writeReview(vault)
    return `wrote ${count} review work items into ${join(vault, 'Boards')}\n`
  }
  const root = fileURLToPath(new URL('..', import.meta.url))
  const vault = i === -1 ? join(root, 'test') : resolve(given ?? '')
  const count = await writeFixture(vault)
  return `wrote ${count} work items into ${join(vault, 'Boards')}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(await main(process.argv.slice(2)))
  } catch (error) {
    process.stderr.write(`fixture: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
