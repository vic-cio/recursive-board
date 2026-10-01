import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  assignEdits, cardSlug, delegateTarget, delegationNote, isHarness, peopleIn, withdrawEdits, workerName,
} from './delegate.ts'
import { applyEdits } from './edits.ts'

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

test('delegateTarget reads agent as a request for any agent', () => {
  assert.deepEqual(delegateTarget('agent', peopleIn([person('People/Ana.md')])), { kind: 'any' })
  assert.deepEqual(delegateTarget(' Agent ', new Map()), { kind: 'any' })
})

test('delegateTarget refuses a person note called agent, because agent is the reserved holder', () => {
  const people = peopleIn([person('People/Agent.md')])
  assert.throws(() => delegateTarget('agent', people), /person note called Agent.*reserved/)
})

test('workerName joins the model and the card slug, or the harness when there is no model', () => {
  assert.equal(workerName('pi', 'price-the-job'), 'pi-price-the-job')
  assert.equal(workerName('codex', 'stop-copying-owner', 'gpt-6-luna'), 'gpt-6-luna-stop-copying-owner')
  assert.equal(workerName('claude', 'price', 'Claude Opus/5.5'), 'claude-opus-5-5-price')
  assert.equal(workerName('claude', 'price', '  '), 'claude-price')
})

test('assignEdits assigns a person and changes no other card data', () => {
  const before = card('status: options\n')
  const edits = assignEdits(before, 'Ana')
  assert.deepEqual(edits, [{ op: 'set', key: 'holder', value: 'Ana' }, { op: 'remove', key: 'agent' }])
  const after = applyEdits(before, edits ?? [])
  assert.match(after, /^holder: Ana$/m)
  assert.match(after, /^status: options$/m)
  assert.match(after, /\nBody\n$/)
  assert.equal(assignEdits(card('status: backlog\n'), 'Ana')?.[0]?.key, 'holder')
  assert.equal(assignEdits(card('status: options\nagent: Ana\n'), 'Ana'), null)
  assert.throws(() => assignEdits(card('status: doing\nagent: codex-x\n'), 'Ana'), /already held by codex-x/)
  assert.throws(() => assignEdits(card('status: done\n'), 'Ana'), /done card/)
})

test('assignEdits assigns the generic agent and changes no other card data', () => {
  const before = card('status: doing\n')
  const edits = assignEdits(before, 'agent')
  assert.deepEqual(edits, [{ op: 'set', key: 'holder', value: 'agent' }, { op: 'remove', key: 'agent' }])
  const after = applyEdits(before, edits ?? [])
  assert.match(after, /^holder: agent$/m)
  assert.match(after, /^status: doing$/m)
  assert.match(after, /\nBody\n$/)
  assert.deepEqual(assignEdits(card('status: options\nholder: agent\n'), 'Ana'),
    [{ op: 'set', key: 'holder', value: 'Ana' }, { op: 'remove', key: 'agent' }])
  assert.equal(assignEdits(card('status: backlog\n'), 'agent')?.[0]?.key, 'holder')
  assert.equal(assignEdits(card('status: options\nholder: agent\n'), 'agent'), null)
  assert.throws(() => assignEdits(card('status: options\nholder: Ana\n'), 'agent'), /already held by Ana/)
})

test('withdrawEdits gives the card back its holder from before a delegation that failed', () => {
  assert.deepEqual(withdrawEdits(card('status: options\nholder: w1\n'), 'w1', undefined),
    [{ op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])
  assert.deepEqual(withdrawEdits(card('status: options\nholder: w1\n'), 'w1', 'agent'),
    [{ op: 'set', key: 'holder', value: 'agent' }, { op: 'remove', key: 'agent' }])
  assert.equal(withdrawEdits(card('status: doing\nholder: w2\n'), 'w1', undefined), null, 'someone else holds it now')
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
