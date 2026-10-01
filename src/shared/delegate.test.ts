import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  cardSlug, delegateTarget, delegationEdits, delegationNote, isHarness, peopleIn, workerName,
} from './delegate.ts'

const card = (fields: string) => `---\ntype: work-item\nid: wi-a1\ntitle: Price the job\n${fields}---\n\nBody\n`

test('peopleIn reads one person per note in People/, by lower-case name', () => {
  const people = peopleIn(['People/Ana.md', 'People/Team/Sam Lee.md', 'Boards/Main.md', 'People/photo.png', 'Peoples/Bo.md'])
  assert.deepEqual([...people.entries()], [['ana', 'Ana'], ['sam lee', 'Sam Lee']])
})

test('isHarness knows claude, codex and pi only', () => {
  assert.deepEqual(['claude', 'codex', 'pi', 'Claude', 'gpt'].map(isHarness), [true, true, true, false, false])
})

test('delegateTarget names a harness first, then a person note, and refuses anything else', () => {
  const people = peopleIn(['People/Ana.md', 'People/Claude.md'])
  assert.deepEqual(delegateTarget('codex', people), { kind: 'agent', harness: 'codex' })
  assert.deepEqual(delegateTarget('claude', people), { kind: 'agent', harness: 'claude' })
  assert.deepEqual(delegateTarget('ana', people), { kind: 'person', name: 'Ana' })
  assert.throws(() => delegateTarget('Bo', people), /no note in People\/ called Bo.*claude, codex or pi/)
  assert.throws(() => delegateTarget('  ', people), /needs a person or a harness/)
})

test('workerName joins the harness and the card slug', () => {
  assert.equal(workerName('pi', 'price-the-job'), 'pi-price-the-job')
})

test('delegationEdits claims the card for the holder like wi claim', () => {
  assert.deepEqual(delegationEdits(card('status: options\n'), 'Ana', false), [
    { op: 'set', key: 'status', value: 'doing' },
    { op: 'set', key: 'agent', value: 'Ana' },
  ])
  assert.equal(delegationEdits(card('status: doing\nagent: Ana\n'), 'Ana', false), null)
  assert.throws(() => delegationEdits(card('status: doing\nagent: codex-x\n'), 'Ana', false), /already claimed by codex-x/)
  assert.throws(() => delegationEdits(card('status: done\n'), 'Ana', false), /done card/)
})

test('delegationNote for a person says who has the card and why', () => {
  assert.equal(delegationNote({ holder: 'Ana', reason: 'She knows the supplier.' }),
    'Delegated to Ana: She knows the supplier.')
  assert.equal(delegationNote({ holder: 'Ana' }), 'Delegated to Ana.')
})

for (const harness of ['claude', 'codex', 'pi'] as const) {
  test(`delegationNote for a ${harness} worker names the harness and the model`, () => {
    assert.equal(
      delegationNote({ holder: `${harness}-price`, harness, model: 'm-1', reason: 'cheap model for a small task' }),
      `Delegated to ${harness}-price, a headless ${harness} worker on m-1: cheap model for a small task.`)
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
