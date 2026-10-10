import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyEdits } from './edits.ts'
import {
  ANY_AGENT, assigneeBadge, assigneeLabel, assigneesIn, assigneesLabel, assigneesOf, isAnyAgent, sameName, setAssigneesEdits,
} from './assignee.ts'

const card = (fields: string) => `---\ntype: work-item\nid: wi-a1\ntitle: Price the job\n${fields}updated: 2026-09-30\n---\n\nBody\n`
const lookup = (fields: Record<string, unknown>) => (key: string) => fields[key]

test('assigneesOf reads assignee, else the old holder, else the old agent', () => {
  assert.deepEqual(assigneesOf(lookup({ assignee: 'Ana' })), ['Ana'])
  assert.deepEqual(assigneesOf(lookup({ holder: 'Bo' })), ['Bo'], 'an old card keeps its assignee')
  assert.deepEqual(assigneesOf(lookup({ agent: 'codex-x' })), ['codex-x'], 'an older card keeps its assignee')
  assert.deepEqual(assigneesOf(lookup({ assignee: 'Ana', holder: 'Bo', agent: 'codex-x' })), ['Ana'],
    'a card with every key uses assignee')
  assert.deepEqual(assigneesOf(lookup({ holder: 'Bo', agent: 'codex-x' })), ['Bo'],
    'a card with both old keys uses holder')
  assert.deepEqual(assigneesOf(lookup({ assignee: '  ', holder: 'Bo' })), ['Bo'], 'a blank assignee is no assignee')
  assert.deepEqual(assigneesOf(lookup({ assignee: 3 })), [])
  assert.deepEqual(assigneesOf(lookup({})), [])
})

test('assigneesOf reads a list of names, as Obsidian gives it', () => {
  assert.deepEqual(assigneesOf(lookup({ assignee: ['Ana', 'w1'] })), ['Ana', 'w1'])
  assert.deepEqual(assigneesOf(lookup({ assignee: ['Ana', ' ', null, 'ana', ' w1 '] })), ['Ana', 'w1'],
    'blank and repeated names are dropped, and a name matches without case')
  assert.deepEqual(assigneesOf(lookup({ assignee: [], holder: ['codex-x'] })), ['codex-x'], 'an empty list is no assignee')
  assert.deepEqual(assigneesOf(lookup({ assignee: 'Ana, w1' })), ['Ana, w1'], 'a plain value is one name, commas and all')
})

test('assigneesIn reads one name, a block list, a flow list and each old key from the text', () => {
  assert.deepEqual(assigneesIn(card('assignee: Ana\n')), ['Ana'])
  assert.deepEqual(assigneesIn(card('assignee:\n  - Ana\n  - w1\n')), ['Ana', 'w1'])
  assert.deepEqual(assigneesIn(card('assignee: [Ana, "w 2"]\n')), ['Ana', 'w 2'])
  assert.deepEqual(assigneesIn(card('holder: Bo\n')), ['Bo'])
  assert.deepEqual(assigneesIn(card('agent: codex-x\n')), ['codex-x'])
  assert.deepEqual(assigneesIn(card('agent:\n  - codex-x\n')), ['codex-x'])
  assert.deepEqual(assigneesIn(card('assignee:\nholder: Bo\n')), ['Bo'], 'an empty assignee is no assignee')
  assert.deepEqual(assigneesIn(card('holder:\nagent: codex-x\n')), ['codex-x'], 'an empty holder is no assignee')
  assert.deepEqual(assigneesIn(card('assignee: Ana\nagent: codex-x\nholder: Bo\n')), ['Ana'],
    'a card with every key uses assignee')
  assert.deepEqual(assigneesIn(card('assignee: Ana Smith\n')), ['Ana Smith'], 'a plain value is never split')
  assert.deepEqual(assigneesIn('no frontmatter'), [])
})

test('agent is the reserved assignee that means any agent', () => {
  assert.equal(ANY_AGENT, 'agent')
  assert.deepEqual(['agent', ' Agent ', 'agents', undefined].map(isAnyAgent), [true, true, false, false])
  assert.equal(assigneeLabel('agent'), 'Agent')
  assert.equal(assigneeLabel('Ana'), 'Ana')
  assert.equal(assigneesLabel(['Ana', 'agent']), 'Ana, Agent')
})

test('names match as links do: trimmed and without case', () => {
  assert.equal(sameName('Ana', ' ana '), true)
  assert.equal(sameName('Ana', 'Anna'), false)
})

test('the card face shows the first assignee\'s initial and +N for the others', () => {
  assert.deepEqual(assigneeBadge(['ana']), { text: 'A', label: 'Assigned to ana' })
  assert.deepEqual(assigneeBadge(['Ana', 'w1', 'agent']), { text: 'A+2', label: 'Assigned to Ana, w1, Agent' })
  assert.deepEqual(assigneeBadge(['agent']), { text: 'A', label: 'Assigned to Agent' })
  assert.equal(assigneeBadge([]), null)
})

test('setting the assignees writes assignee and drops holder and agent', () => {
  assert.deepEqual(setAssigneesEdits(['Ana']), [{ op: 'set', key: 'assignee', value: 'Ana' },
    { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])
  assert.deepEqual(setAssigneesEdits(['Ana', 'w1']),
    [{ op: 'list', key: 'assignee', values: ['Ana', 'w1'] },
      { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])
  assert.deepEqual(setAssigneesEdits([]), [{ op: 'remove', key: 'assignee' },
    { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])

  const old = card('status: options\nagent: codex-x\nmystery: keep\n')
  const two = applyEdits(old, setAssigneesEdits(['codex-x', 'Ana']))
  assert.match(two, /^assignee:\n {2}- codex-x\n {2}- Ana$/m)
  assert.doesNotMatch(two, /^agent:/m)
  assert.match(two, /^mystery: keep$/m)
  const one = applyEdits(two, setAssigneesEdits(['Ana']))
  assert.match(one, /^updated: 2026-09-30\nassignee: Ana\n---$/m, 'the list goes back to a plain value in its place')
  assert.equal(applyEdits(one, setAssigneesEdits([])), card('status: options\nmystery: keep\n'))

  const held = card('status: doing\nholder: Bo\nagent: codex-x\nmystery: keep\n')
  const moved = applyEdits(held, setAssigneesEdits(['Ana']))
  assert.match(moved, /^assignee: Ana$/m)
  assert.doesNotMatch(moved, /^holder:/m)
  assert.doesNotMatch(moved, /^agent:/m)
})
