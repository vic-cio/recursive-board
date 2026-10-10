import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cardState } from './card-state.ts'
import { applyEdits } from './edits.ts'
import {
  ANY_AGENT, holderBadge, holderLabel, holdersIn, holdersLabel, holdersOf, isAnyAgent, sameName, setHoldersEdits,
} from './holder.ts'

const card = (fields: string) => `---\ntype: work-item\nid: wi-a1\ntitle: Price the job\n${fields}updated: 2026-09-30\n---\n\nBody\n`
const lookup = (fields: Record<string, unknown>) => (key: string) => fields[key]

test('holdersOf reads holder, and an old card\'s agent when holder is absent', () => {
  assert.deepEqual(holdersOf(lookup({ holder: 'Ana' })), ['Ana'])
  assert.deepEqual(holdersOf(lookup({ agent: 'codex-x' })), ['codex-x'], 'an old card keeps its holder')
  assert.deepEqual(holdersOf(lookup({ holder: 'Ana', agent: 'codex-x' })), ['Ana'], 'a card with both uses holder')
  assert.deepEqual(holdersOf(lookup({ holder: '  ', agent: 'codex-x' })), ['codex-x'], 'a blank holder is no holder')
  assert.deepEqual(holdersOf(lookup({ holder: 3 })), [])
  assert.deepEqual(holdersOf(lookup({})), [])
})

test('holdersOf reads a list of names, as Obsidian gives it', () => {
  assert.deepEqual(holdersOf(lookup({ holder: ['Ana', 'w1'] })), ['Ana', 'w1'])
  assert.deepEqual(holdersOf(lookup({ holder: ['Ana', ' ', null, 'ana', ' w1 '] })), ['Ana', 'w1'],
    'blank and repeated names are dropped, and a name matches without case')
  assert.deepEqual(holdersOf(lookup({ holder: [], agent: ['codex-x'] })), ['codex-x'], 'an empty list is no holder')
  assert.deepEqual(holdersOf(lookup({ holder: 'Ana, w1' })), ['Ana, w1'], 'a plain value is one name, commas and all')
})

test('holdersIn reads one name, a block list, a flow list and the old agent key from the text', () => {
  assert.deepEqual(holdersIn(card('holder: Ana\n')), ['Ana'])
  assert.deepEqual(holdersIn(card('holder:\n  - Ana\n  - w1\n')), ['Ana', 'w1'])
  assert.deepEqual(holdersIn(card('holder: [Ana, "w 2"]\n')), ['Ana', 'w 2'])
  assert.deepEqual(holdersIn(card('agent: codex-x\n')), ['codex-x'])
  assert.deepEqual(holdersIn(card('agent:\n  - codex-x\n')), ['codex-x'])
  assert.deepEqual(holdersIn(card('holder:\nagent: codex-x\n')), ['codex-x'], 'an empty holder is no holder')
  assert.deepEqual(holdersIn(card('holder: Ana Smith\n')), ['Ana Smith'], 'a plain value is never split')
  assert.deepEqual(holdersIn('no frontmatter'), [])
})

test('cardState reads the holders through the same rule', () => {
  assert.deepEqual(cardState(card('status: doing\nagent: alpha\n')).holders, ['alpha'])
  assert.deepEqual(cardState(card('status: doing\nholder: beta\nagent: alpha\n')).holders, ['beta'])
  assert.deepEqual(cardState(card('status: doing\nholder: ""\n')).holders, [])
  assert.deepEqual(cardState(card('status: doing\nholder:\n  - Ana\n  - beta\n')).holders, ['Ana', 'beta'])
})

test('agent is the reserved holder that means any agent', () => {
  assert.equal(ANY_AGENT, 'agent')
  assert.deepEqual(['agent', ' Agent ', 'agents', undefined].map(isAnyAgent), [true, true, false, false])
  assert.equal(holderLabel('agent'), 'Agent')
  assert.equal(holderLabel('Ana'), 'Ana')
  assert.equal(holdersLabel(['Ana', 'agent']), 'Ana, Agent')
})

test('names match as links do: trimmed and without case', () => {
  assert.equal(sameName('Ana', ' ana '), true)
  assert.equal(sameName('Ana', 'Anna'), false)
})

test('the card face shows the first holder\'s initial and +N for the others', () => {
  assert.deepEqual(holderBadge(['ana']), { text: 'A', label: 'Held by ana' })
  assert.deepEqual(holderBadge(['Ana', 'w1', 'agent']), { text: 'A+2', label: 'Held by Ana, w1, Agent' })
  assert.deepEqual(holderBadge(['agent']), { text: 'A', label: 'Held by Agent' })
  assert.equal(holderBadge([]), null)
})

test('setting the holders writes a plain value for one name and a list for several, and drops agent', () => {
  assert.deepEqual(setHoldersEdits(['Ana']), [{ op: 'set', key: 'holder', value: 'Ana' }, { op: 'remove', key: 'agent' }])
  assert.deepEqual(setHoldersEdits(['Ana', 'w1']),
    [{ op: 'list', key: 'holder', values: ['Ana', 'w1'] }, { op: 'remove', key: 'agent' }])
  assert.deepEqual(setHoldersEdits([]), [{ op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }])

  const old = card('status: options\nagent: codex-x\nmystery: keep\n')
  const two = applyEdits(old, setHoldersEdits(['codex-x', 'Ana']))
  assert.match(two, /^holder:\n {2}- codex-x\n {2}- Ana$/m)
  assert.doesNotMatch(two, /^agent:/m)
  assert.match(two, /^mystery: keep$/m)
  const one = applyEdits(two, setHoldersEdits(['Ana']))
  assert.match(one, /^updated: 2026-09-30\nholder: Ana\n---$/m, 'the list goes back to a plain value in its place')
  assert.equal(applyEdits(one, setHoldersEdits([])), card('status: options\nmystery: keep\n'))
})
