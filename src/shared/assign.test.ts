import { test } from 'node:test'
import assert from 'node:assert/strict'

import { assignEdits, assignTarget, peopleIn, unassignEdits } from './assign.ts'
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

test('assignTarget names a person note, and refuses anything else, harness names included', () => {
  const people = peopleIn([person('People/Ana.md')])
  assert.deepEqual(assignTarget('ana', people), { kind: 'person', name: 'Ana' })
  assert.throws(() => assignTarget('Bo', people), /no person note called Bo.*type: person.*--to agent/)
  assert.throws(() => assignTarget('claude', people), /no person note called claude/)
  assert.throws(() => assignTarget('  ', people), /needs a person, or agent/)
})

test('assignTarget reads agent as a request for any agent', () => {
  assert.deepEqual(assignTarget('agent', peopleIn([person('People/Ana.md')])), { kind: 'any' })
  assert.deepEqual(assignTarget(' Agent ', new Map()), { kind: 'any' })
})

test('assignTarget refuses a person note called agent, because agent is the reserved name', () => {
  const people = peopleIn([person('People/Agent.md')])
  assert.throws(() => assignTarget('agent', people), /person note called Agent.*reserved/)
})

test('assignEdits assigns a person and changes no other card data', () => {
  const before = card('status: options\n')
  const edits = assignEdits(before, 'Ana')
  assert.deepEqual(edits, [{ op: 'set', key: 'assignee', value: 'Ana' }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])
  const after = applyEdits(before, edits ?? [])
  assert.match(after, /^assignee: Ana$/m)
  assert.match(after, /^status: options$/m)
  assert.match(after, /\nBody\n$/)
  assert.equal(assignEdits(card('status: backlog\n'), 'Ana')?.[0]?.key, 'assignee')
  assert.equal(assignEdits(card('status: options\nagent: Ana\n'), 'ana'), null, 'a name already there writes nothing')
  assert.throws(() => assignEdits(card('status: done\n'), 'Ana'), /done card/)
})

test('assignEdits adds a name to the assignees: a person and an agent can share a card at once', () => {
  assert.deepEqual(assignEdits(card('status: doing\nagent: codex-x\n'), 'Ana'),
    [{ op: 'list', key: 'assignee', values: ['codex-x', 'Ana'] }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }],
    'an old card\'s agent becomes the first assignee')
  assert.deepEqual(assignEdits(card('status: doing\nassignee:\n  - Ana\n  - w1\n'), 'agent'),
    [{ op: 'list', key: 'assignee', values: ['Ana', 'w1', 'agent'] }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])
  assert.equal(assignEdits(card('status: doing\nassignee: [Ana, w1]\n'), 'w1'), null)
})

test('assignEdits assigns the generic agent and changes no other card data', () => {
  const before = card('status: doing\n')
  const edits = assignEdits(before, 'agent')
  assert.deepEqual(edits, [{ op: 'set', key: 'assignee', value: 'agent' }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])
  const after = applyEdits(before, edits ?? [])
  assert.match(after, /^assignee: agent$/m)
  assert.match(after, /^status: doing$/m)
  assert.match(after, /\nBody\n$/)
  assert.deepEqual(assignEdits(card('status: options\nholder: agent\n'), 'Ana'),
    [{ op: 'list', key: 'assignee', values: ['agent', 'Ana'] }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])
  assert.equal(assignEdits(card('status: options\nholder: agent\n'), 'agent'), null)
  assert.deepEqual(assignEdits(card('status: options\nassignee: Ana\n'), 'agent'),
    [{ op: 'list', key: 'assignee', values: ['Ana', 'agent'] }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])
})

test('unassignEdits removes one name and leaves the status, and a name not there writes nothing', () => {
  assert.deepEqual(unassignEdits(card('status: doing\nassignee:\n  - Ana\n  - w1\n'), 'ana'),
    [{ op: 'set', key: 'assignee', value: 'w1' }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])
  assert.deepEqual(unassignEdits(card('status: doing\nagent: codex-x\n'), 'codex-x'),
    [{ op: 'remove', key: 'assignee' }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])
  assert.equal(unassignEdits(card('status: doing\nassignee: Ana\n'), 'Bo'), null)
})
