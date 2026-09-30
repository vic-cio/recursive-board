import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cardState } from './card-state.ts'
import { applyStampedEdits, editsFor } from './edits.ts'
import { statusEditsIn, untickEditsIn } from './transitions.ts'
import { dependencyEditIn, dependsOnRaw } from './dependencies.ts'
import { areaTagEditsIn } from './area-tags.ts'

const TEXT = `---
type: work-item
status: doing
agent: alpha
blocked: true
archived: true
board: true
area: true
depends_on: "[[Spec]]"
mystery: keep
updated: 2026-09-21
---

Body.
`

test('cardState reads the values an edit rule depends on from the text', () => {
  assert.deepEqual(cardState(TEXT), {
    status: 'doing', prevStatus: undefined, hasPrevStatus: false, agent: 'alpha',
    blocked: true, archived: true, board: true, hasBoardKey: true, area: true,
  })
  const bare = cardState('---\ntype: work-item\nstatus: nonsense\nprev_status: done\nagent: "  "\n---\n')
  assert.equal(bare.status, undefined)
  assert.equal(bare.prevStatus, 'done')
  assert.equal(bare.hasPrevStatus, true)
  assert.equal(bare.agent, undefined, 'a blank agent is no agent')
  assert.equal(bare.blocked, false)
})

test('editsFor takes a list as it is and runs a plan on the text', () => {
  assert.deepEqual(editsFor(TEXT, [{ op: 'remove', key: 'x' }]), [{ op: 'remove', key: 'x' }])
  assert.deepEqual(editsFor(TEXT, () => null), [])
  assert.deepEqual(editsFor(TEXT, (text) => [{ op: 'set', key: 'seen', value: cardState(text).agent ?? '' }]),
    [{ op: 'set', key: 'seen', value: 'alpha' }])
})

test('applyStampedEdits accepts a plan and stamps only a change', () => {
  assert.equal(applyStampedEdits(TEXT, () => null, '2026-09-30'), TEXT)
  const out = applyStampedEdits(TEXT, (text) => statusEditsIn(text, 'done'), '2026-09-30')
  assert.match(out, /^status: done$/m)
  assert.match(out, /^prev_status: doing$/m)
  assert.match(out, /^updated: 2026-09-30$/m)
})

test('statusEditsIn and untickEditsIn read the current status and prev_status', () => {
  assert.equal(statusEditsIn(TEXT, 'doing'), null)
  const done = '---\nstatus: done\nprev_status: options\n---\n'
  assert.deepEqual(untickEditsIn(done), [{ op: 'set', key: 'status', value: 'options' }, { op: 'remove', key: 'prev_status' }])
  assert.deepEqual(untickEditsIn('---\nstatus: done\n---\n'), [{ op: 'set', key: 'status', value: 'backlog' }])
  assert.equal(untickEditsIn('---\nstatus: doing\n---\n'), null, 'unticking a card that is no longer done changes nothing')
})

test('dependsOnRaw reads one wikilink, a list, or nothing', () => {
  assert.deepEqual(dependsOnRaw(TEXT), ['[[Spec]]'])
  assert.deepEqual(dependsOnRaw('---\ndepends_on:\n  - "[[A]]"\n  - "[[B]]"\n---\n'), ['[[A]]', '[[B]]'])
  assert.deepEqual(dependsOnRaw('---\ntype: work-item\n---\n'), [])
})

test('dependencyEditIn adds to and removes from the list in the text', () => {
  assert.deepEqual(dependencyEditIn(TEXT, 'Build', true), { op: 'list', key: 'depends_on', values: ['[[Spec]]', '[[Build]]'] })
  assert.equal(dependencyEditIn(TEXT, 'Spec', true), null)
  assert.deepEqual(dependencyEditIn(TEXT, 'Spec', false), { op: 'list', key: 'depends_on', values: [] })
})

test('areaTagEditsIn replaces only the area tag in the current tags', () => {
  const text = '---\ntags:\n  - design\n  - area/old\n---\n'
  assert.deepEqual(areaTagEditsIn(text, 'area/new'), [{ op: 'list', key: 'tags', values: ['design', 'area/new'] }])
  assert.equal(areaTagEditsIn('---\ntags:\n  - area/new\n---\n', 'area/new'), null)
  assert.deepEqual(areaTagEditsIn(text, null), [{ op: 'list', key: 'tags', values: ['design'] }])
})
