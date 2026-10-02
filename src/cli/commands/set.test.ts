import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { setPeople } from './set.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

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

test('wi set writes the owner as a plain name, and an empty --role removes an old role field', async () => {
  fixture = seed({ owner: '"[[Ana]]"', role: 'Checker' })
  const change = await setPeople(await loadVault(fixture.root), 'Task', { owner: 'Ana' })
  assert.deepEqual(change.changed, ['owner'])
  assert.match(textOf(fixture), /^owner: Ana$/m)
  await assert.rejects(setPeople(await loadVault(fixture.root), 'Task', { role: 'Checker' }),
    /a role is a tag now\. Run: wi tag Task role\/checker/)
  assert.match(textOf(fixture), /^role: Checker$/m, 'a refused --role writes nothing')
  assert.deepEqual((await setPeople(await loadVault(fixture.root), 'Task', { role: '' })).changed, ['role'])
  assert.doesNotMatch(textOf(fixture), /^role:/m)
})

test('a creator written as a link is rewritten as the same plain name', async () => {
  fixture = seed({ creator: '"[[Ana]]"' })
  const change = await setPeople(await loadVault(fixture.root), 'Task', { creator: 'Ana' })
  assert.deepEqual(change.changed, ['creator'])
  assert.match(textOf(fixture), /^creator: Ana$/m)
})

test('the creator is set once and never changes', async () => {
  fixture = seed()
  await setPeople(await loadVault(fixture.root), 'Task', { creator: 'Session agent', model: 'claude-opus-5-5' })
  assert.match(textOf(fixture), /^creator: Session agent\ncreator_model: claude-opus-5-5$/m)
  const again = await setPeople(await loadVault(fixture.root), 'Task', { creator: 'Session agent', model: 'claude-opus-5-5' })
  assert.deepEqual(again.changed, [])
  await assert.rejects(setPeople(await loadVault(fixture.root), 'Task', { creator: 'Ana' }), /set once/)
  await assert.rejects(setPeople(await loadVault(fixture.root), 'Task', { model: 'gpt-6-luna' }), /set with the creator/)
})

test('a model needs a creator', async () => {
  fixture = seed()
  await assert.rejects(setPeople(await loadVault(fixture.root), 'Task', { model: 'gpt-6-luna' }), /Pass --creator too/)
})
