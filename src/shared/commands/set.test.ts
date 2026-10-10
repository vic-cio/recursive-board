import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { setPeople } from './set.ts'
import { loadVault } from '../../cli/vault.ts'
import { makeVault, item, type Fixture } from '../../cli/test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(extra: Record<string, string> = {}): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-09-21', updated: '2026-09-21' }))
  f.write('Boards/Task.md', item({ type: 'work-item', id: 'wi-0002', title: 'Task', status: 'options', parent: '"[[Main]]"',
    created: '2026-09-21', updated: '2026-09-21', ...extra }, '## Notes\n'))
  f.write('People/Ana.md', '---\ntype: person\n---\n')
  return f
}
const textOf = (f: Fixture) => readFileSync(`${f.root}/Boards/Task.md`, 'utf8')

test('wi set with --role "" removes an old role field and leaves a legacy owner key alone', async () => {
  fixture = seed({ owner: 'Ana', role: 'Checker' })
  const change = await setPeople(await loadVault(fixture.root), 'Task', { role: '' })
  assert.deepEqual(change.changed, ['role'])
  assert.doesNotMatch(textOf(fixture), /^role:/m)
  assert.match(textOf(fixture), /^owner: Ana$/m, 'a legacy owner key survives every write')
  await assert.rejects(setPeople(await loadVault(fixture.root), 'Task', { role: 'Checker' }),
    /a role is a tag now\. Run: wi tag Task role\/checker/)
  assert.match(textOf(fixture), /^owner: Ana$/m, 'a refused --role writes nothing')
})
