import { test } from 'node:test'
import assert from 'node:assert/strict'

import { assignEdits, delegateTarget, peopleIn } from './delegate.ts'
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

test('delegateTarget names a person note, and refuses anything else, harness names included', () => {
  const people = peopleIn([person('People/Ana.md')])
  assert.deepEqual(delegateTarget('ana', people), { kind: 'person', name: 'Ana' })
  assert.throws(() => delegateTarget('Bo', people), /no person note called Bo.*type: person.*--to agent/)
  assert.throws(() => delegateTarget('claude', people), /no person note called claude/)
  assert.throws(() => delegateTarget('  ', people), /needs a person, or agent/)
})

test('delegateTarget reads agent as a request for any agent', () => {
  assert.deepEqual(delegateTarget('agent', peopleIn([person('People/Ana.md')])), { kind: 'any' })
  assert.deepEqual(delegateTarget(' Agent ', new Map()), { kind: 'any' })
})

test('delegateTarget refuses a person note called agent, because agent is the reserved holder', () => {
  const people = peopleIn([person('People/Agent.md')])
  assert.throws(() => delegateTarget('agent', people), /person note called Agent.*reserved/)
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
