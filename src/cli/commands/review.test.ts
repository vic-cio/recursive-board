import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { giveVerdict, sendForReview } from './review.ts'
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

/** Task in doing, sent to Ana for review by its agent. */
async function requested(f: Fixture): Promise<void> {
  await sendForReview(await loadVault(f.root), 'Task', 'Ana', ['Work/a.md'], '', 'codex', new Date(2026, 8, 28, 15, 4))
}

const later = new Date(2026, 8, 29, 9, 30)

test('wi approve notes the reviewer and closes the card in one write', async () => {
  fixture = seed()
  await requested(fixture)
  const result = await giveVerdict(await loadVault(fixture.root), 'wi-task', { verdict: 'approve', you: 'Ana' }, later)
  const text = readFileSync(`${fixture.root}/Boards/Task.md`, 'utf8')
  assert.equal(result.item.id, 'wi-task')
  assert.equal(result.status, 'done')
  assert.match(text, /^status: done$/m)
  assert.match(text, /^prev_status: doing$/m)
  assert.match(text, /^updated: 2026-09-29$/m)
  assert.ok(text.includes('- 2026-09-29 09:30: Approved by Ana.\n'))
})

test('wi approve names the parent when the card was its last open child', async () => {
  fixture = seed()
  fixture.write('Boards/Project.md', item({ type: 'work-item', id: 'wi-proj', title: 'Project', status: 'doing', parent: '"[[Main]]"' }))
  fixture.write('Boards/Task.md', item({ type: 'work-item', id: 'wi-task', title: 'Task', status: 'doing', parent: '"[[Project]]"' }, '## Notes\n'))
  fixture.write('Boards/Later.md', item({ type: 'work-item', id: 'wi-later', title: 'Later', status: 'options', parent: '"[[Main]]"', depends_on: '["[[Task]]"]' }))
  await requested(fixture)
  const result = await giveVerdict(await loadVault(fixture.root), 'Task', { verdict: 'approve', you: 'Ana' }, later)
  assert.equal(result.parentReady?.id, 'wi-proj')
  assert.deepEqual(result.unblocked.map((card) => card.id), ['wi-later'])
})

test('wi send-back notes the comment, removes the owner and keeps the card in doing', async () => {
  fixture = seed()
  await requested(fixture)
  const result = await giveVerdict(await loadVault(fixture.root), 'Task',
    { verdict: 'send back', you: 'Ana', comment: 'Recheck the totals.', writer: 'Relay (model-1)' }, later)
  const text = readFileSync(`${fixture.root}/Boards/Task.md`, 'utf8')
  assert.equal(result.status, 'doing')
  assert.match(text, /^status: doing$/m)
  assert.doesNotMatch(text, /^owner:/m)
  assert.ok(text.includes('- 2026-09-29 09:30, Relay (model-1): Sent back by Ana: Recheck the totals.\n'))
})

test('a verdict is refused, and nothing is written, for a card that does not wait for this reviewer', async () => {
  fixture = seed()
  fixture.write('People/Bo.md', '---\ntype: person\n---\n')
  const path = `${fixture.root}/Boards/Task.md`
  const vault = async () => loadVault(fixture!.root)
  // No request yet.
  await assert.rejects(giveVerdict(await vault(), 'Task', { verdict: 'approve', you: 'Ana' }, later), /Send it for review first/)
  await requested(fixture)
  const before = readFileSync(path, 'utf8')
  await assert.rejects(giveVerdict(await vault(), 'Task', { verdict: 'approve', you: 'Bo' }, later), /waits for review by Ana, not Bo/)
  await assert.rejects(giveVerdict(await vault(), 'Main', { verdict: 'approve', you: 'Ana' }, later), /root/)
  assert.equal(readFileSync(path, 'utf8'), before)
  // A second verdict on the same request.
  await giveVerdict(await vault(), 'Task', { verdict: 'send back', you: 'Ana', comment: '' }, later)
  await assert.rejects(giveVerdict(await vault(), 'Task', { verdict: 'approve', you: 'Ana' }, later), /Send it for review first/)
})

test('a verdict is refused for a card with an open child, as For review leaves it out', async () => {
  fixture = seed()
  await requested(fixture)
  fixture.write('Boards/Step.md', item({ type: 'work-item', id: 'wi-step', title: 'Step', status: 'doing', parent: '"[[Task]]"' }))
  fixture.write('Boards/Old step.md', item({ type: 'work-item', id: 'wi-old', title: 'Old step', status: 'backlog', parent: '"[[Task]]"', archived: true }))
  fixture.write('Boards/Done step.md', item({ type: 'work-item', id: 'wi-done', title: 'Done step', status: 'done', parent: '"[[Task]]"' }))
  const before = readFileSync(`${fixture.root}/Boards/Task.md`, 'utf8')
  await assert.rejects(giveVerdict(await loadVault(fixture.root), 'Task', { verdict: 'approve', you: 'Ana' }, later), /1 open child: Step/)
  assert.equal(readFileSync(`${fixture.root}/Boards/Task.md`, 'utf8'), before)
})
