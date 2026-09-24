/**
 * The board's grouping rules, which are pure and so testable without Obsidian.
 * `index.ts` imports only types from `obsidian`, and those erase, so this runs in plain Node.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { toAreas, toColumns, compareSiblings, type WorkItemMeta } from './index.ts'
import { doneCutoff } from '../shared/schema.ts'
import type { Status } from '../shared/schema.ts'

const NOW = new Date(2026, 8, 22) // 2026-09-22

function meta(over: Partial<WorkItemMeta> & { stem: string }): WorkItemMeta {
  return {
    file: { path: `Boards/${over.stem}.md`, basename: over.stem } as WorkItemMeta['file'],
    stem: over.stem,
    id: over.id ?? `wi-${over.stem}`,
    title: over.title ?? over.stem,
    status: over.status,
    parentLink: over.parentLink ?? 'Main',
    parent: over.parent ?? null,
    board: over.board ?? false,
    area: over.area ?? false,
    priority: over.priority,
    updated: over.updated,
    owner: over.owner,
    agent: over.agent,
    blocked: over.blocked ?? false,
    archived: over.archived ?? false,
    effectiveArchived: over.effectiveArchived ?? false,
    prevStatus: over.prevStatus,
    labels: over.labels ?? [],
  }
}

const card = (stem: string, status: Status, updated?: string) => meta({ stem, status, updated })

test('doneCutoff is fourteen days back', () => {
  assert.equal(doneCutoff(NOW), '2026-09-08')
  assert.equal(doneCutoff(new Date(2026, 0, 5)), '2025-12-22', 'it crosses a year boundary')
})

test('toColumns always returns the four columns in board order', () => {
  const columns = toColumns([], NOW)
  assert.deepEqual(columns.map((c) => c.status), ['backlog', 'options', 'doing', 'done'])
  for (const column of columns) assert.deepEqual(column.visible, [])
})

test('toColumns groups children by status', () => {
  const columns = toColumns([
    card('A', 'backlog'), card('B', 'doing'), card('C', 'backlog'),
  ], NOW)
  assert.deepEqual(columns[0]!.visible.map((c) => c.stem), ['A', 'C'])
  assert.deepEqual(columns[2]!.visible.map((c) => c.stem), ['B'])
})

test('areas appear in their status columns and count active Doing cards', () => {
  const area = meta({ stem: 'Area', area: true, status: 'doing' })
  const doing = card('Doing', 'doing')
  const archived = meta({ stem: 'Archived', status: 'doing', effectiveArchived: true })
  const nestedArea = meta({ stem: 'Nested', area: true, status: 'backlog' })
  const summaries = toAreas([area], (item) => item === area ? [doing, archived, nestedArea] : [])
  assert.deepEqual(summaries.map((entry) => [entry.meta.stem, entry.doingCount]), [['Area', 1]])
  assert.deepEqual(toColumns([area, doing], NOW)[2]!.visible.map((item) => item.stem), ['Area', 'Doing'])
})

test('done areas leave the area bar and stay in Done', () => {
  const area = meta({ stem: 'Done area', area: true, status: 'done', updated: '2026-09-20' })
  assert.deepEqual(toAreas([area], () => []), [])
  assert.deepEqual(toColumns([area], NOW)[3]!.visible.map((item) => item.stem), ['Done area'])
})

test('backlog areas leave the area bar and stay in Backlog', () => {
  const area = meta({ stem: 'Someday area', area: true, status: 'backlog' })
  assert.deepEqual(toAreas([area], () => []), [])
  assert.deepEqual(toColumns([area], NOW)[0]!.visible.map((item) => item.stem), ['Someday area'])
})

test('area summaries respect the board archived-items view', () => {
  const area = meta({ stem: 'Archived area', area: true, status: 'doing', effectiveArchived: true })
  const doing = meta({ stem: 'Archived card', status: 'doing', effectiveArchived: true })
  const childrenOf = () => [doing]
  assert.deepEqual(toAreas([area], childrenOf), [])
  assert.equal(toAreas([area], childrenOf, true)[0]?.doingCount, 1)
})

test('a done item inside the window shows', () => {
  const columns = toColumns([card('Fresh', 'done', '2026-09-20')], NOW)
  assert.deepEqual(columns[3]!.visible.map((c) => c.stem), ['Fresh'])
  assert.equal(columns[3]!.hidden, 0)
})

test('a done item older than the window is counted, not drawn', () => {
  const columns = toColumns([
    card('Fresh', 'done', '2026-09-20'),
    card('Stale', 'done', '2026-08-01'),
    card('Ancient', 'done', '2025-01-01'),
  ], NOW)
  assert.deepEqual(columns[3]!.visible.map((c) => c.stem), ['Fresh'])
  assert.equal(columns[3]!.hidden, 2)
})

test('the window boundary is inclusive', () => {
  const columns = toColumns([card('Edge', 'done', '2026-09-08')], NOW)
  assert.equal(columns[3]!.visible.length, 1)
})

test('a done item with no updated date is treated as stale, never as fresh', () => {
  const columns = toColumns([card('Undated', 'done')], NOW)
  assert.equal(columns[3]!.visible.length, 0)
  assert.equal(columns[3]!.hidden, 1)
})

test('the window never hides anything outside done', () => {
  const columns = toColumns([
    card('Old', 'backlog', '2020-01-01'), card('Older', 'doing', '2019-01-01'),
  ], NOW)
  assert.equal(columns[0]!.visible.length, 1)
  assert.equal(columns[2]!.visible.length, 1)
  assert.equal(columns[0]!.hidden + columns[2]!.hidden, 0)
})

test('archived items are counted separately from the Done window and can be shown dimmed', () => {
  const rows = [
    meta({ stem: 'Archive', status: 'backlog', effectiveArchived: true }),
    meta({ stem: 'Old archived', status: 'done', updated: '2020-01-01', effectiveArchived: true }),
    meta({ stem: 'Old done', status: 'done', updated: '2020-01-01' }),
  ]
  const hidden = toColumns(rows, NOW)
  assert.equal(hidden[0]!.archived.length, 1)
  assert.deepEqual(hidden[0]!.visible, [])
  assert.equal(hidden[3]!.hidden, 1)
  assert.equal(hidden[3]!.archived.length, 1)
  assert.deepEqual(toColumns(rows, NOW, true)[3]!.visible.map((c) => c.stem), ['Old archived'])
})

test('compareSiblings puts priority first, ascending', () => {
  const rows = [meta({ stem: 'B', priority: 3 }), meta({ stem: 'A', priority: 1 })]
  assert.deepEqual([...rows].sort(compareSiblings).map((r) => r.stem), ['A', 'B'])
})

test('compareSiblings puts an unprioritised item after a prioritised one', () => {
  const rows = [meta({ stem: 'None' }), meta({ stem: 'P9', priority: 9 })]
  assert.deepEqual([...rows].sort(compareSiblings).map((r) => r.stem), ['P9', 'None'])
})

test('compareSiblings breaks a priority tie by most recently updated', () => {
  const rows = [
    meta({ stem: 'Old', updated: '2026-01-01' }),
    meta({ stem: 'New', updated: '2026-09-01' }),
  ]
  assert.deepEqual([...rows].sort(compareSiblings).map((r) => r.stem), ['New', 'Old'])
})

test('compareSiblings is stable on a full tie, so the board does not shuffle', () => {
  const rows = [meta({ stem: 'Zeta' }), meta({ stem: 'Alpha' })]
  assert.deepEqual([...rows].sort(compareSiblings).map((r) => r.stem), ['Alpha', 'Zeta'])
})
