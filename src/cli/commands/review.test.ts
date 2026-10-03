import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { sendForReview } from './review.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-main', title: 'Main' }))
  f.write('Boards/Task.md', item({ type: 'work-item', id: 'wi-task', title: 'Task', status: 'doing', parent: '"[[Main]]"' }, '## Notes\n'))
  f.write('People/Ana.md', '---\ntype: person\n---\n')
  return f
}

test('wi review sets the chosen person and adds all files to one Review note', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  const result = await sendForReview(vault, 'Task', 'Ana', ['Work/a.md', 'Work/b.pdf'], '', 'Writer', new Date(2026, 8, 28, 15, 4))
  const text = readFileSync(`${fixture.root}/Boards/Task.md`, 'utf8')
  assert.equal(result.item.id, 'wi-task')
  assert.match(text, /^owner: Ana$/m)
  assert.ok(text.includes('- 2026-09-28 15:04, Writer: **Review:** Please review `Work/a.md`, `Work/b.pdf`.\n'))
})

test('wi review accepts only a person note and a card', async () => {
  fixture = seed()
  const vault = await loadVault(fixture.root)
  await assert.rejects(sendForReview(vault, 'Task', 'Nobody', []), /no person note called Nobody/)
  await assert.rejects(sendForReview(vault, 'Main', 'Ana', []), /root/)
})
