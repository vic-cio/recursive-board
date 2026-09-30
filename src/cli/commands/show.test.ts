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
    created: '2026-09-01', updated: '2026-09-29', blocked: true,
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
  assert.deepEqual(shown.blocked, { flag: false, waiting: true })

  const build = showCard(await loadVault(fixture.root), 'wi-build')
  assert.equal(build.owner, 'Victor')
  assert.equal(build.agent, 'codex')
  assert.equal(build.role, 'Worker')
  assert.equal(build.priority, 2)
  assert.equal(build.due, '2026-10-03')
  assert.equal(build.objective, 'Build the app.')
  assert.equal(build.context, 'Use the spec.')
  assert.deepEqual(build.acceptanceCriteria, ['App starts', 'Tests pass'])
  assert.equal(build.notes, '- Work started.')
  assert.deepEqual(build.children, { total: 2, open: 1, done: 1, items: [
    { id: 'wi-deploy', title: 'Deploy', status: 'options', archived: false },
    { id: 'wi-test', title: 'Test', status: 'done', archived: false },
  ] })
  assert.deepEqual(build.blocked, { flag: true, waiting: false })
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
