import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { archiveItem } from './archive.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => { fixture?.cleanup(); fixture = undefined })

function seed(): Fixture {
  const f = makeVault()
  const write = (stem: string, id: string, fields: Record<string, string | boolean>) => f.write(`Boards/${stem}.md`, item({
    type: 'work-item', id, title: stem, created: '2026-09-01', updated: '2026-09-01', ...fields,
  }))
  write('Main', 'wi-0001', {})
  write('Project', 'wi-0002', { status: 'backlog', parent: '"[[Main]]"' })
  write('Task', 'wi-0003', { status: 'done', parent: '"[[Project]]"' })
  return f
}

test('archive and undo each edit only the selected file', async () => {
  fixture = seed()
  const taskPath = join(fixture.root, 'Boards/Task.md')
  const before = readFileSync(taskPath, 'utf8')
  const first = await archiveItem(await loadVault(fixture.root), 'Project', false)
  assert.equal(first.changed, true)
  assert.match(readFileSync(join(fixture.root, 'Boards/Project.md'), 'utf8'), /^archived: true$/m)
  assert.equal(readFileSync(taskPath, 'utf8'), before)
  const second = await archiveItem(await loadVault(fixture.root), 'Project', true)
  assert.equal(second.changed, true)
  assert.doesNotMatch(readFileSync(join(fixture.root, 'Boards/Project.md'), 'utf8'), /^archived:/m)
  assert.equal(readFileSync(taskPath, 'utf8'), before)
})

test('archive refuses and names a doing descendant without writing', async () => {
  fixture = seed()
  fixture.write('Boards/Task.md', item({ type: 'work-item', id: 'wi-0003', title: 'Task', status: 'doing', parent: '"[[Project]]"', created: '2026-09-01', updated: '2026-09-01' }))
  const path = join(fixture.root, 'Boards/Project.md')
  const before = readFileSync(path, 'utf8')
  await assert.rejects(archiveItem(await loadVault(fixture.root), 'Project', false), /Task.*doing/i)
  assert.equal(readFileSync(path, 'utf8'), before)
})
