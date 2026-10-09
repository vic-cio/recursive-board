import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { addNote } from './note.ts'
import { loadVault } from '../../cli/vault.ts'
import { parseFrontmatter } from '../frontmatter.ts'
import { today } from '../schema.ts'
import { makeVault, item, type Fixture } from '../../cli/test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-09-21', updated: '2026-09-21' }))
  f.write('Boards/Task.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Task', status: 'doing', parent: '"[[Main]]"', agent: 'luna-3',
    created: '2026-09-21', updated: '2026-09-21',
  }, '## Notes\n\nHuman note.\n\n## Knowledge\n\n- \n'))
  return f
}

const textOf = (f: Fixture) => readFileSync(`${f.root}/Boards/Task.md`, 'utf8')
const now = new Date(2026, 8, 25, 14, 3)

test('addNote refuses to write when the caller does not name its writer', async () => {
  fixture = seed()
  await assert.rejects(addNote(await loadVault(fixture.root), 'Task', 'Priced 12 lines.', undefined, now), /writer name/)
  assert.doesNotMatch(textOf(fixture), /Priced 12 lines/)
})

test('addNote signs the named writer and model, and stamps updated', async () => {
  fixture = seed()
  await addNote(await loadVault(fixture.root), 'Task', 'Priced 12 lines.', { agent: 'worker-1', model: 'gpt-6-luna' }, now)
  assert.ok(textOf(fixture).endsWith('## Notes\n\nHuman note.\n- 2026-09-25 14:03, worker-1 (gpt-6-luna): Priced 12 lines.\n\n## Knowledge\n\n- \n'))
  assert.equal(parseFrontmatter(textOf(fixture))!.get('updated'), today())
})

test('addNote takes an explicit agent, such as a dispatcher', async () => {
  fixture = seed()
  const added = await addNote(await loadVault(fixture.root), 'wi-0002', 'Worker started.', { agent: 'dispatcher' }, now)
  assert.equal(added.line, '- 2026-09-25 14:03, dispatcher: Worker started.')
})

test('notes from two writers that loaded the same vault both survive', async () => {
  fixture = seed()
  const a = await loadVault(fixture.root)
  const b = await loadVault(fixture.root)
  await Promise.all([addNote(a, 'Task', 'From A.', { agent: 'a' }, now), addNote(b, 'Task', 'From B.', { agent: 'b' }, now)])
  assert.match(textOf(fixture), /, a: From A\./)
  assert.match(textOf(fixture), /, b: From B\./)
})

test('addNote wraps placeholders in note text and preserves links', async () => {
  fixture = seed()
  await addNote(await loadVault(fixture.root), 'Task', 'Set <port>; see [docs](<docs/index.md>).', { agent: 'worker' }, now)
  assert.match(textOf(fixture), /Set `<port>`; see \[docs\]\(<docs\/index\.md>\)\./)
})
