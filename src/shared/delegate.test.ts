import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  assignEdits, cardSlug, delegateTarget, delegationNote, isHarness, peopleIn, workerName,
} from './delegate.ts'

const card = (fields: string) => `---\ntype: work-item\nid: wi-a1\ntitle: Price the job\n${fields}---\n\nBody\n`

const person = (path: string) => ({ path, type: 'person' })

test('peopleIn reads one person per note with type: person, in any folder, by lower-case name', () => {
  const people = peopleIn([
    person('People/Ana.md'), person('Team/Sam Lee.md'), person('photo.png'),
    { path: 'People/Bo.md', type: 'role' }, { path: 'People/Cy.md', type: undefined },
  ])
  assert.deepEqual([...people.entries()], [['ana', 'Ana'], ['sam lee', 'Sam Lee']])
})

test('isHarness knows claude, codex and pi only', () => {
  assert.deepEqual(['claude', 'codex', 'pi', 'Claude', 'gpt'].map(isHarness), [true, true, true, false, false])
})

test('delegateTarget names a harness first, then a person note, and refuses anything else', () => {
  const people = peopleIn([person('People/Ana.md'), person('People/Claude.md')])
  assert.deepEqual(delegateTarget('codex', people), { kind: 'agent', harness: 'codex' })
  assert.deepEqual(delegateTarget('claude', people), { kind: 'agent', harness: 'claude' })
  assert.deepEqual(delegateTarget('ana', people), { kind: 'person', name: 'Ana' })
  assert.throws(() => delegateTarget('Bo', people), /no person note called Bo.*type: person.*claude, codex or pi/)
  assert.throws(() => delegateTarget('  ', people), /needs a person or a harness/)
})

test('workerName joins the harness and the card slug', () => {
  assert.equal(workerName('pi', 'price-the-job'), 'pi-price-the-job')
})

test('assignEdits puts the person on the card and leaves its status alone', () => {
  assert.deepEqual(assignEdits(card('status: options\n'), 'Ana'), [{ op: 'set', key: 'agent', value: 'Ana' }])
  assert.deepEqual(assignEdits(card('status: backlog\n'), 'Ana'), [{ op: 'set', key: 'agent', value: 'Ana' }])
  assert.equal(assignEdits(card('status: options\nagent: Ana\n'), 'Ana'), null)
  assert.throws(() => assignEdits(card('status: doing\nagent: codex-x\n'), 'Ana'), /already held by codex-x/)
  assert.throws(() => assignEdits(card('status: done\n'), 'Ana'), /done card/)
})

for (const harness of ['claude', 'codex', 'pi'] as const) {
  test(`delegationNote for a ${harness} worker names the harness and the model`, () => {
    assert.equal(delegationNote({ holder: `${harness}-price`, harness, model: 'm-1' }),
      `Delegated to ${harness}-price, a headless ${harness} worker on m-1.`)
    assert.equal(delegationNote({ holder: `${harness}-price`, harness }),
      `Delegated to ${harness}-price, a headless ${harness} worker.`)
  })
}

test('cardSlug makes a branch-safe slug from the title, cut at a word', () => {
  assert.equal(cardSlug('Add wi delegate', 'wi-a1'), 'add-wi-delegate')
  assert.equal(cardSlug('Docs: help, README & ADR', 'wi-a1'), 'docs-help-readme-adr')
  assert.equal(cardSlug('Café menu', 'wi-a1'), 'cafe-menu')
  assert.equal(cardSlug('Split the long refactor of the vault loader into steps', 'wi-a1'), 'split-the-long-refactor-of-the-vault')
  assert.equal(cardSlug('????', 'wi-a1'), 'wi-a1')
})
