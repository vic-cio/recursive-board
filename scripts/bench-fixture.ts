/** A deterministic, valid synthetic vault for the board-open benchmark. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatScalar } from '../src/shared/frontmatter.ts'
import { today, type Status } from '../src/shared/schema.ts'

export const BENCH_ROOT = 'Benchmark Root'
const BOARDS = ['Planning', 'Delivery', 'Operations', 'Research']
const STATUSES: readonly Status[] = ['backlog', 'options', 'doing', 'done']

function dateAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return today(date)
}

/** N counts child cards. The root is an additional file. */
export async function writeBenchFixture(vault: string, cards = 1000): Promise<void> {
  if (!Number.isSafeInteger(cards) || cards < BOARDS.length) {
    throw new Error(`cards must be an integer of at least ${BOARDS.length}`)
  }
  const folder = join(vault, 'Boards')
  await mkdir(folder, { recursive: true })
  await writeFile(join(vault, '.wi.json'), JSON.stringify({ defaultRoot: BENCH_ROOT }), 'utf8')
  await writeFile(join(folder, `${BENCH_ROOT}.md`), [
    '---', 'type: work-item', 'id: wi-broot', `title: ${BENCH_ROOT}`,
    `created: ${dateAgo(90)}`, `updated: ${dateAgo(0)}`, 'board: true', '---', '',
    '## Objective', '', 'Coordinate the synthetic work across several teams.', '',
  ].join('\n'), 'utf8')

  // Most cards are directly on the root board; the rest exercise four promoted boards
  // and two further parent levels. Every parent is written before its child.
  const pending: Promise<void>[] = []
  for (let i = 0; i < cards; i++) {
    const stem = i < BOARDS.length ? `Board ${BOARDS[i]}` : `Card ${String(i).padStart(5, '0')}`
    const mode = i % 10
    const parent = i < BOARDS.length || mode <= 6
      ? BENCH_ROOT
      : mode <= 8 ? `Board ${BOARDS[i % BOARDS.length]}` : `Card ${String(i - 2).padStart(5, '0')}`
    const status = STATUSES[i % STATUSES.length]!
    const updated = dateAgo(status === 'done' && i % 3 === 0 ? 25 : i % 12)
    const fields = [
      '---', 'type: work-item', `id: wi-b${i.toString(36)}`,
      `title: ${formatScalar(stem)}`, `status: ${status}`,
      `parent: ${formatScalar(`[[${parent}]]`)}`,
      `created: ${dateAgo(90 - i % 60)}`, `updated: ${updated}`,
    ]
    if (i < BOARDS.length || i % 80 === 0) fields.push('board: true')
    if (i % 3 === 0) fields.push(`priority: ${i % 4 + 1}`)
    if (i % 5 === 0) fields.push('tags: [product, review]')
    if (i % 7 === 0) fields.push('owner: team')
    if (i % 23 === 0) fields.push('blocked: true')
    if (status === 'done') fields.push('prev_status: doing')
    const body = [
      '---', '', '## Objective', '',
      `Complete ${stem.toLowerCase()} and record the outcome for the next review.`, '',
      '## Context', '', 'This card depends on work in the same planning cycle.', '',
      '## Acceptance Criteria', '', '- The change is reviewed', '- Follow-up work is recorded', '',
      '## Notes', '', 'Generated benchmark content. No personal vault data.', '',
    ]
    pending.push(writeFile(join(folder, `${stem}.md`), [...fields, ...body].join('\n'), 'utf8'))
    if (pending.length === 100) {
      await Promise.all(pending)
      pending.length = 0
    }
  }
  await Promise.all(pending)
}

/** Creates a disposable vault owned by the caller. The benchmark removes it after measuring. */
export async function makeBenchVault(cards = 1000): Promise<string> {
  const vault = await mkdtemp(join(tmpdir(), 'recursive-board-bench-'))
  try {
    await writeBenchFixture(vault, cards)
    return vault
  } catch (error) {
    await rm(vault, { recursive: true, force: true })
    throw error
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cards = Number(process.argv[2] ?? '1000')
  const vault = await makeBenchVault(cards)
  process.stdout.write(`${vault}\n`)
}
