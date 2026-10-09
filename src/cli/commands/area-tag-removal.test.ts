import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createItem } from '../../shared/commands/new.ts'
import { validate } from '../../shared/commands/validate.ts'
import { loadVault } from '../vault.ts'
import { getList } from '../../shared/frontmatter.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(): Fixture {
  const f = makeVault()
  f.write('.wi.json', JSON.stringify({ areaTags: true }))
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', board: true }))
  f.write('Boards/Work.md', item({ type: 'work-item', id: 'wi-0002', title: 'Work', status: 'doing', area: true, parent: '"[[Main]]"' }))
  f.write('Boards/Task.md', `---\ntype: work-item\nid: wi-0003\ntitle: Task\nstatus: backlog\nparent: "[[Work]]"\ntags:\n  - area/old\ncreated: 2026-09-21\nupdated: 2026-09-21\n---\n`)
  return f
}

test('wi new never writes area tags when a legacy setting is present', async () => {
  fixture = seed()
  const created = await createItem(await loadVault(fixture.root), { title: 'New task', parent: 'Work' })
  assert.equal(getList(readFileSync(join(fixture!.root, created.relPath), 'utf8'), 'tags'), undefined)
})

test('validate ignores stale area tags on legacy cards', async () => {
  fixture = seed()
  const report = await validate(await loadVault(fixture.root))
  assert.equal(report.problems.some((problem) => problem.rule === 'area-tag-stale'), false)
  assert.deepEqual(getList(readFileSync(join(fixture.root, 'Boards/Task.md'), 'utf8'), 'tags'), ['area/old'])
})
