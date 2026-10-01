import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { showCard } from './show.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

test('showCard returns the card, its brief, ancestry, dependencies, and children', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-root', title: 'Main' }, '## Objective\n\nDeliver the project.\n'))
  fixture.write('Boards/Build.md', item({
    type: 'work-item', id: 'wi-build', title: 'Build', status: 'doing', parent: '"[[Main]]"',
    board: true, owner: 'Victor', agent: 'codex', role: 'Worker', priority: 2, due: '2026-10-03',
    created: '2026-09-01', updated: '2026-09-29',
  }, '## Objective\n\nBuild the app.\n\n## Context\n\nUse the spec.\n\n## Acceptance Criteria\n\n- App starts\n- Tests pass\n\n## Notes\n\n- Work started.\n'))
  fixture.write('Boards/Ship.md', item({
    type: 'work-item', id: 'wi-ship', title: 'Ship', status: 'options', parent: '"[[Main]]"',
    depends_on: '"[[Build]]"',
  }))
  fixture.write('Boards/Test.md', item({ type: 'work-item', id: 'wi-test', title: 'Test', status: 'done', parent: '"[[Build]]"' }))
  fixture.write('Boards/Deploy.md', item({ type: 'work-item', id: 'wi-deploy', title: 'Deploy', status: 'options', parent: '"[[Build]]"' }))

  const shown = showCard(await loadVault(fixture.root), 'wi-ship')
  assert.equal(shown.id, 'wi-ship')
  assert.equal(shown.parent?.id, 'wi-root')
  assert.deepEqual(shown.ancestry.map((entry) => entry.id), ['wi-root'])
  assert.deepEqual(shown.dependencies.map((entry) => [entry.id, entry.satisfied]), [['wi-build', false]])
  assert.equal('blocked' in shown, false)

  const build = showCard(await loadVault(fixture.root), 'wi-build')
  assert.equal(build.owner, 'Victor')
  assert.equal(build.holder, 'codex', 'an old card\'s agent is its holder')
  assert.equal('agent' in build, false)
  assert.equal(build.role, 'Worker')
  assert.equal(build.priority, 2)
  assert.equal(build.due, '2026-10-03')
  assert.equal(build.objective, 'Build the app.')
  assert.equal(build.context, 'Use the spec.')
  assert.deepEqual(build.acceptanceCriteria, ['App starts', 'Tests pass'])
  assert.equal(build.notes, '- Work started.')
  assert.deepEqual(build.knowledge, [])
  assert.deepEqual(build.children, { total: 2, open: 1, done: 1, items: [
    { id: 'wi-deploy', title: 'Deploy', status: 'options', archived: false },
    { id: 'wi-test', title: 'Test', status: 'done', archived: false },
  ] })
  assert.equal('blocked' in build, false)
})

test('showCard returns the Knowledge lines and an empty list when the section is absent', async () => {
  fixture = makeVault()
  fixture.write('Boards/Knowledge.md', item({ type: 'work-item', id: 'wi-knowledge', title: 'Knowledge' },
    '## Knowledge\n\n- [[First note]]\n  Detail for the agent.\n\n- [ ] [[Second note]]\n'))
  fixture.write('Boards/Empty.md', item({ type: 'work-item', id: 'wi-empty', title: 'Empty' }))

  const vault = await loadVault(fixture.root)
  assert.deepEqual(showCard(vault, 'wi-knowledge').knowledge, [
    '- [[First note]]', 'Detail for the agent.', '- [ ] [[Second note]]',
  ])
  assert.deepEqual(showCard(vault, 'wi-empty').knowledge, [])
})

test('showCard exposes a broken parent link and unresolved dependencies', async () => {
  fixture = makeVault()
  fixture.write('Boards/Orphan.md', item({
    type: 'work-item', id: 'wi-orphan', title: 'Orphan', status: 'options', parent: '"[[Missing]]"',
    depends_on: '"[[Gone]]"',
  }))
  const shown = showCard(await loadVault(fixture.root), 'wi-orphan')
  assert.equal(shown.parent, null)
  assert.equal(shown.parentIssue, 'Missing')
  assert.deepEqual(shown.unresolvedDependencies, ['Gone'])
})

test('showCard returns the nearest effective role and marks inherited roles', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-root', title: 'Main', role: 'Builder' }))
  fixture.write('Boards/Board.md', item({ type: 'work-item', id: 'wi-board', title: 'Board',
    parent: '"[[Main]]"', role: 'Checker', board: true }))
  fixture.write('Boards/Inherited.md', item({ type: 'work-item', id: 'wi-child', title: 'Inherited',
    parent: '"[[Board]]"' }))
  fixture.write('Boards/Override.md', item({ type: 'work-item', id: 'wi-override', title: 'Override',
    parent: '"[[Board]]"', role: 'Reviewer' }))

  const vault = await loadVault(fixture.root)
  assert.equal(showCard(vault, 'Inherited').role, 'Checker')
  assert.equal(showCard(vault, 'Inherited').roleInherited, true)
  assert.equal(showCard(vault, 'Override').role, 'Reviewer')
  assert.equal(showCard(vault, 'Override').roleInherited, false)
})
