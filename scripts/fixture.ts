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
 * - a blocked item, an agent-owned item, labels, priorities and two promoted boards.
 *
 * Usage: node scripts/fixture.ts [--vault test]
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderWorkItem } from '../src/shared/work-item.ts'
import { parseFrontmatter } from '../src/shared/frontmatter.ts'
import { fileNameFor, today, type Status } from '../src/shared/schema.ts'

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
  agent?: string
  priority?: number
  tags?: string[]
  board?: boolean
  area?: boolean
  blocked?: boolean
  prevStatus?: Status
  /** Frontmatter lines outside the schema, written as given. */
  unknown?: string[]
  body?: string
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
    created: 30, updated: 4, agent: 'codex', blocked: true,
    body: OBJECTIVE('Track app sessions so a reconnect attaches rather than spawning a duplicate.') },
  { id: 'wi-0007', title: 'Streaming', parent: 'Build server', status: 'options', created: 30,
    updated: 1, agent: 'codex', priority: 1,
    body: OBJECTIVE('Stream command and agent output to the app.') },

  { id: 'wi-0013', title: 'Marketing site', parent: 'Main', status: 'backlog', created: 10,
    updated: 2, owner: 'sam', priority: 2, tags: ['web', 'design'], board: true,
    body: OBJECTIVE('A second, unrelated branch of work, so the board is not one tall tree.') },
  // The same title as wi-0005 under another parent. `fileNameFor` gives it the id suffix.
  { id: 'wi-b2e1', title: 'Authentication', parent: 'Marketing site', status: 'backlog',
    created: 10, updated: 2 },
  { id: 'wi-0015', title: 'Product pages', parent: 'Marketing site', status: 'doing',
    created: 10, updated: 1, tags: ['design'] },

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
    updated: 1, agent: 'codex' },
  { id: 'wi-0021', title: 'Operations', parent: 'Main', area: true, status: 'backlog', created: 5, updated: 2,
    body: OBJECTIVE('An ongoing space for work that does not have a definition of done.') },
]

function daysAgo(days: number, now: Date): string {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return today(date)
}

/** Keys outside what `renderWorkItem` writes, appended before the frontmatter closes. */
function extraLines(spec: Spec): string[] {
  const lines: string[] = []
  if (spec.tags) lines.push(`tags: [${spec.tags.join(', ')}]`)
  if (spec.board) lines.push('board: true')
  if (spec.blocked) lines.push('blocked: true')
  if (spec.prevStatus) lines.push(`prev_status: ${spec.prevStatus}`)
  return [...lines, ...(spec.unknown ?? [])]
}

/** The root has no parent and no status, which `renderWorkItem` does not write. */
function renderRoot(spec: Spec, now: Date): string {
  const lines = [
    'type: work-item', `id: ${spec.id}`, `title: ${spec.title}`,
    `created: ${daysAgo(spec.created, now)}`, `updated: ${daysAgo(spec.updated, now)}`,
    ...extraLines(spec),
  ]
  return `---\n${lines.join('\n')}\n---\n\n${spec.body ?? ''}`
}

function render(spec: Spec, parentStem: string, now: Date): string {
  const common = {
    id: spec.id,
    title: spec.title,
    parentStem,
    owner: spec.owner,
    agent: spec.agent,
    priority: spec.priority,
    created: daysAgo(spec.created, now),
    updated: daysAgo(spec.updated, now),
  }
  const text = renderWorkItem(spec.area
    ? { ...common, area: true, status: spec.status ?? 'backlog', template: 'area' }
    : { ...common, status: spec.status ?? 'backlog' })
  const close = text.indexOf('\n---\n', 4)
  const extra = extraLines(spec)
  const head = extra.length > 0 ? `${text.slice(0, close)}\n${extra.join('\n')}` : text.slice(0, close)
  const body = spec.body ?? text.slice(close + 5).replace(/^\n/, '')
  return `${head}\n---\n\n${body}`
}

/** Returns the files it would write, keyed by path inside the vault. */
export function generate(now: Date = new Date()): Map<string, string> {
  const files = new Map<string, string>()
  const taken = new Set<string>()
  const stemOfTitle = new Map<string, string>()

  for (const spec of SPECS) {
    const stem = fileNameFor(spec.title, spec.id, taken)
    taken.add(stem.toLowerCase())
    // The first item with a title is what a parent reference by title means.
    if (!stemOfTitle.has(spec.title)) stemOfTitle.set(spec.title, stem)
    const parentStem = spec.parent === undefined ? null : stemOfTitle.get(spec.parent) ?? spec.parent
    const text = parentStem === null ? renderRoot(spec, now) : render(spec, parentStem, now)
    files.set(`Boards/${stem}.md`, text)
  }
  return files
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--vault')
  const root = fileURLToPath(new URL('..', import.meta.url))
  const vault = i === -1 ? join(root, 'test') : resolve(process.argv[i + 1] ?? '')
  const count = await writeFixture(vault)
  process.stdout.write(`wrote ${count} work items into ${join(vault, 'Boards')}\n`)
}
