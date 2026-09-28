import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  agentGroups, areaOf, cardsInScope, IDLE_MS, parseReviewLine, progress, waitsForReview, type DashItem, type DashTree,
} from './dashboard-model.ts'

interface Fake extends DashItem { parent: Fake | null; mtime: number }

function vault() {
  const items: Fake[] = []
  const add = (title: string, parent: Fake | null, fields: Partial<Fake> = {}): Fake => {
    const item: Fake = {
      title, parent, parentLink: parent?.title ?? null, status: parent ? 'backlog' : undefined,
      area: false, board: false, owner: undefined, agent: undefined, effectiveArchived: false, mtime: 0, ...fields,
    }
    items.push(item)
    return item
  }
  const tree: DashTree<Fake> = {
    childrenOf: (item) => items.filter((other) => other.parent === item),
    ancestorsOf: (item) => {
      const chain: Fake[] = []
      for (let up = item.parent; up; up = up.parent) chain.unshift(up)
      return chain
    },
    mtimeOf: (item) => item.mtime,
  }
  return { items, add, tree }
}

test('a card belongs to its nearest area', () => {
  const { add, tree } = vault()
  const root = add('Home', null)
  const work = add('Work', root, { area: true, status: 'doing' })
  const site = add('Site', work, { area: true, status: 'doing' })
  const card = add('Fix header', site)
  assert.equal(areaOf(card, tree), site)
  assert.equal(areaOf(add('Loose', root), tree), null)
})

test('the scope holds live cards under the chosen root, not roots, areas or archived cards', () => {
  const { items, add, tree } = vault()
  const home = add('Home', null)
  const other = add('Other', null)
  const area = add('Work', home, { area: true, status: 'doing' })
  const card = add('Card', area)
  add('Gone', area, { effectiveArchived: true })
  const elsewhere = add('Elsewhere', other)
  assert.deepEqual(cardsInScope(items, home, tree), [card])
  assert.deepEqual(cardsInScope(items, null, tree), [card, elsewhere])
})

test('a card waits for review when it is yours, in doing, with no open child', () => {
  const { add, tree } = vault()
  const root = add('Home', null)
  const card = add('Check the quote', root, { status: 'doing', owner: 'Victor' })
  assert.equal(waitsForReview(card, 'victor', tree), true)
  assert.equal(waitsForReview(card, 'Sam', tree), false)
  assert.equal(waitsForReview(card, '', tree), false)
  const step = add('Step', card, { status: 'doing' })
  assert.equal(waitsForReview(card, 'Victor', tree), false)
  step.status = 'done'
  assert.equal(waitsForReview(card, 'Victor', tree), true)
})

test('the review line gives what to check and the files to open', () => {
  const text = '## Notes\n\n- **Review:** Check the totals: `Work/35b/schedule.xlsx`, `Work/35b/report.md`.\n'
  assert.deepEqual(parseReviewLine(text), {
    what: 'Check the totals.',
    paths: ['Work/35b/schedule.xlsx', 'Work/35b/report.md'],
  })
  assert.equal(parseReviewLine('## Notes\n\n- nothing\n'), null)
})

test('the newest review line wins, after a wi note prefix', () => {
  const text = '- **Review:** Old: `a.pdf`\n- 2026-09-28 09:31, claude: **Review:** Check the rates: `Rates/rates.csv`\n'
  assert.deepEqual(parseReviewLine(text), { what: 'Check the rates', paths: ['Rates/rates.csv'] })
})

test('progress counts leaf cards per area, with no area last', () => {
  const { items, add, tree } = vault()
  const root = add('Home', null)
  const area = add('Work', root, { area: true, status: 'doing' })
  const board = add('Board', area, { board: true, status: 'doing' })
  add('A', board, { status: 'done' })
  add('B', board, { status: 'doing' })
  add('Loose', root, { status: 'done' })
  const rows = progress(cardsInScope(items, null, tree), tree)
  assert.deepEqual(rows.map(({ name, done, doing, total }) => ({ name, done, doing, total })), [
    { name: 'Work', done: 1, doing: 1, total: 2 },
    { name: 'No area', done: 1, doing: 0, total: 1 },
  ])
})

test('an agent is working, idle, or finished', () => {
  const { items, add, tree } = vault()
  const now = 10 * IDLE_MS
  const root = add('Home', null)
  const area = add('Work', root, { area: true, status: 'doing' })
  const working = add('Working', area, { status: 'doing', agent: 'claude', mtime: now - 60_000 })
  const idle = add('Idle', area, { status: 'doing', agent: 'codex', mtime: now - 2 * IDLE_MS })
  const fresh = add('Fresh step', idle, { status: 'doing', mtime: now - 1000 })
  const handed = add('Handed over', area, { status: 'doing', agent: 'claude', owner: 'Victor', mtime: now })
  const stepsDone = add('Steps done', area, { status: 'doing', agent: 'claude', mtime: now - 5000 })
  add('Only step', stepsDone, { status: 'done', mtime: now - 5000 })
  const closed = add('Closed', area, { status: 'done', agent: 'claude', mtime: now - 3 * IDLE_MS })

  let [group] = agentGroups(cardsInScope(items, null, tree), 'Victor', tree, now)
  // The idle card's child changed a second ago, so its claim is live.
  assert.deepEqual(group!.working.map((claim) => claim.card), [idle, working])
  assert.equal(group!.working[0]!.active, fresh.mtime)
  assert.deepEqual(group!.finished.map((claim) => claim.card), [handed, stepsDone, closed])

  fresh.mtime = now - 2 * IDLE_MS
  ;[group] = agentGroups(cardsInScope(items, null, tree), 'Victor', tree, now)
  assert.deepEqual(group!.idle.map((claim) => claim.card), [idle])
})
