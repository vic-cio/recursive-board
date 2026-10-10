import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { showCard } from './show.ts'
import { loadVault, readRoleTaggedNotes } from '../../cli/vault.ts'
import { makeVault, item, type Fixture } from '../../cli/test-helpers.ts'

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
    board: true, owner: 'Victor', agent: 'codex', priority: 2, due: '2026-10-03',
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
  assert.deepEqual(shown.assignees, [], 'no assignee is an empty list')
  assert.equal(shown.parent?.id, 'wi-root')
  assert.deepEqual(shown.ancestry.map((entry) => entry.id), ['wi-root'])
  assert.deepEqual(shown.dependencies.map((entry) => [entry.id, entry.satisfied]), [['wi-build', false]])
  assert.equal('blocked' in shown, false)

  const build = showCard(await loadVault(fixture.root), 'wi-build')
  assert.equal('owner' in build, false, 'no JSON result carries owner, even on an old card that has the key')
  assert.deepEqual(build.assignees, ['codex'], 'an old card\'s agent is its assignee, in a list')
  assert.equal('agent' in build, false)
  assert.equal('holder' in build, false)
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

test('showCard lists the card\'s own role tags, and a parent\'s role tag does not reach it', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-root', title: 'Main' }))
  fixture.write('Boards/Board.md', item({ type: 'work-item', id: 'wi-board', title: 'Board',
    parent: '"[[Main]]"', board: true, tags: '[role/checker]' }))
  fixture.write('Boards/Plain.md', item({ type: 'work-item', id: 'wi-plain', title: 'Plain', parent: '"[[Board]]"' }))
  fixture.write('Boards/Tagged.md', item({ type: 'work-item', id: 'wi-tagged', title: 'Tagged',
    parent: '"[[Board]]"', tags: '[web, "#Role/Coder", role/checker]' }))

  const vault = await loadVault(fixture.root)
  assert.deepEqual(showCard(vault, 'Plain').roles, [])
  assert.deepEqual(showCard(vault, 'Tagged').roles, ['Role/Coder', 'role/checker'])
  assert.equal('role' in showCard(vault, 'Tagged'), false)
})

test('showCard names the procedure notes for each role tag, from the tagged notes it is given', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-root', title: 'Main' }))
  fixture.write('Boards/Tagged.md', item({ type: 'work-item', id: 'wi-tagged', title: 'Tagged',
    parent: '"[[Main]]"', tags: '[role/checker, role/coder]' }))
  fixture.write('Roles/Checker.md', '---\ntags: [role/checker]\n---\nCheck the sample.\n')

  const vault = await loadVault(fixture.root)
  const card = showCard(vault, 'Tagged', await readRoleTaggedNotes(fixture.root))
  assert.deepEqual(card.procedures, [
    { tag: 'role/checker', notes: ['Roles/Checker.md'] },
    { tag: 'role/coder', notes: [] },
  ])
  assert.deepEqual(showCard(vault, 'Tagged').procedures.map((role) => role.notes), [[], []])
})

test('showCard gives several assignees as a list, from a block list or a flow list', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-root', title: 'Main' }))
  fixture.write('Boards/Pair.md', item({ type: 'work-item', id: 'wi-pair', title: 'Pair', status: 'doing', parent: '"[[Main]]"',
    assignee: '[Victor, w1]' }))
  fixture.write('Boards/Old.md', item({ type: 'work-item', id: 'wi-old', title: 'Old', status: 'doing', parent: '"[[Main]]"',
    holder: 'Bo' }))
  fixture.write('Boards/Trio.md', '---\ntype: work-item\nid: wi-trio\ntitle: Trio\nstatus: doing\nparent: "[[Main]]"\n' +
    'assignee:\n  - Victor\n  - w1\n  - agent\n---\n')
  const vault = await loadVault(fixture.root)
  assert.deepEqual(showCard(vault, 'wi-pair').assignees, ['Victor', 'w1'])
  assert.deepEqual(showCard(vault, 'wi-old').assignees, ['Bo'], 'an old holder key still assigns the card')
  assert.deepEqual(showCard(vault, 'wi-trio').assignees, ['Victor', 'w1', 'agent'])
  assert.equal('holder' in showCard(vault, 'wi-pair'), false, 'no JSON result carries holder')
})
