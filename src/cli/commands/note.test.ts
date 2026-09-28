import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { addNote } from './note.ts'
import { loadVault } from '../vault.ts'
import { parseFrontmatter } from '../../shared/frontmatter.ts'
import { today } from '../../shared/schema.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

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

test('addNote appends under Notes, names the card agent, and stamps updated', async () => {
  fixture = seed()
  await addNote(await loadVault(fixture.root), 'Task', 'Priced 12 lines.', undefined, now)
  assert.ok(textOf(fixture).endsWith('## Notes\n\nHuman note.\n- 2026-09-25 14:03, luna-3: Priced 12 lines.\n\n## Knowledge\n\n- \n'))
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
  await addNote(await loadVault(fixture.root), 'Task', 'Set <port>; see [docs](<docs/index.md>).', undefined, now)
  assert.match(textOf(fixture), /Set `<port>`; see \[docs\]\(<docs\/index\.md>\)\./)
})
