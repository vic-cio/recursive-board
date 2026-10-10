import { test } from 'node:test'
import assert from 'node:assert/strict'

import { claimEdits, firstChildPromotion, moveEdits, moveRefusal, releaseEdits, statusEditsIn } from './transitions.ts'

// A small tree, keyed the way either writer keys it: Main > Project > Server > Auth, Main > Site.
const PARENTS: Record<string, string | null> = {
  main: null,
  project: 'main',
  server: 'project',
  auth: 'server',
  site: 'main',
}
const parentOf = (key: string) => PARENTS[key] ?? null

test('moveEdits writes the parent wikilink and nothing else', () => {
  assert.deepEqual(moveEdits('Project', 'Marketing site'), [
    { op: 'set', key: 'parent', value: '[[Marketing site]]' },
  ])
})

test('moveEdits keeps status: a move changes where, not how far along', () => {
  const edits = moveEdits('Project', 'Site') ?? []
  assert.equal(edits.some((e) => e.key === 'status' || e.key === 'prev_status'), false)
})

test('moveEdits is a no-op onto the current parent, so nothing syncs for nothing', () => {
  assert.equal(moveEdits('Project', 'Project'), null)
})

test('moveEdits compares parents the way Obsidian resolves them, ignoring case', () => {
  assert.equal(moveEdits('project', 'Project'), null)
})

test('moveRefusal allows an ordinary move', () => {
  assert.equal(moveRefusal({ item: 'auth', isRoot: false, target: 'site', parentOf }), null)
})

test('moveRefusal refuses to move a root, which has no parent to change', () => {
  assert.match(moveRefusal({ item: 'main', isRoot: true, target: 'site', parentOf }) ?? '', /root/i)
})

test('moveRefusal refuses to move an item under itself', () => {
  assert.match(moveRefusal({ item: 'server', isRoot: false, target: 'server', parentOf }) ?? '', /itself/i)
})

test('moveRefusal refuses a move under a descendant, which would cut the subtree off', () => {
  assert.match(moveRefusal({ item: 'project', isRoot: false, target: 'auth', parentOf }) ?? '', /under its own/i)
})

test('moveRefusal terminates on a vault whose parent chain already loops', () => {
  const looped = (key: string) => ({ a: 'b', b: 'a', x: 'main' } as Record<string, string>)[key] ?? null
  assert.equal(moveRefusal({ item: 'x', isRoot: false, target: 'a', parentOf: looped }), null)
})

test('moveRefusal allows moving an orphan, because that is how an orphan is repaired', () => {
  const orphaned = () => null
  assert.equal(moveRefusal({ item: 'lost', isRoot: false, target: 'main', parentOf: orphaned }), null)
})

test('firstChildPromotion promotes a plain card on its first child only', () => {
  const card = { isRoot: false, area: false, hasBoardKey: false, childCount: 0 }
  assert.deepEqual(firstChildPromotion(card, true), [{ op: 'set', key: 'board', value: true }])
  assert.equal(firstChildPromotion(card, false), null, 'the vault setting turns it off')
  assert.equal(firstChildPromotion({ ...card, childCount: 1 }, true), null, 'a chosen checklist stays one')
  assert.equal(firstChildPromotion({ ...card, hasBoardKey: true }, true), null)
  assert.equal(firstChildPromotion({ ...card, isRoot: true }, true), null)
  assert.equal(firstChildPromotion({ ...card, area: true }, true), null)
})

const WAITING = '---\ntype: work-item\nstatus: doing\ndepends_on:\n  - "[[Spec]]"\n  - "[[Ana]]"\n---\n'
const isPerson = (target: string) => target === 'Ana'

test('statusEditsIn to done also clears the person links in depends_on', () => {
  assert.deepEqual(statusEditsIn(WAITING, 'done', isPerson), [
    { op: 'set', key: 'status', value: 'done' },
    { op: 'set', key: 'prev_status', value: 'doing' },
    { op: 'list', key: 'depends_on', values: ['[[Spec]]'] },
  ])
})

test('statusEditsIn leaves depends_on alone for any other move, or without a person rule', () => {
  assert.equal(statusEditsIn(WAITING, 'backlog', isPerson)?.some((edit) => edit.key === 'depends_on'), false)
  assert.equal(statusEditsIn(WAITING, 'done')?.some((edit) => edit.key === 'depends_on'), false)
})

const DOING = { op: 'set', key: 'status', value: 'doing' } as const
const assigneeIs = (value: string) => [{ op: 'set', key: 'assignee', value }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }]
const assigneesAre = (...values: string[]) => [{ op: 'list', key: 'assignee', values }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' }]

test('a claim on an unassigned card writes the claimant as the one assignee and moves it to doing', () => {
  assert.deepEqual(claimEdits('options', [], 'w1', false, false), [DOING, ...assigneeIs('w1')])
})

test('an assignee starts its own card: only the status moves, and a repeat in doing writes nothing', () => {
  assert.deepEqual(claimEdits('options', ['w1'], 'w1', false, false), [DOING])
  assert.deepEqual(claimEdits('options', ['Victor', 'W1'], 'w1', false, false), [DOING], 'a name matches without case')
  assert.equal(claimEdits('doing', ['w1'], 'w1', false, false), null)
  assert.equal(claimEdits('doing', ['Victor', 'w1'], 'w1', false, false), null)
})

test('a claim replaces the request for any agent with the claimant, and keeps the other assignees', () => {
  assert.deepEqual(claimEdits('options', ['agent'], 'w1', false, false), [DOING, ...assigneeIs('w1')])
  assert.deepEqual(claimEdits('doing', ['agent'], 'w1', false, false), assigneeIs('w1'))
  assert.deepEqual(claimEdits('doing', ['Victor', 'agent'], 'w1', false, false), assigneesAre('Victor', 'w1'))
})

test('a claim refuses a card that others are assigned to and that asks for no agent: assign first', () => {
  assert.throws(() => claimEdits('options', ['w2'], 'w1', false, false), /already assigned to w2\..*wi assign/)
  assert.throws(() => claimEdits('doing', ['Victor', 'w2'], 'w1', false, false), /already assigned to Victor, w2/)
})

test('a claim refuses the reserved name, a done card, and a board whose doing child another works', () => {
  assert.throws(() => claimEdits('options', [], 'agent', false, false), /reserved/)
  assert.throws(() => claimEdits('options', [], 'Agent', false, false), /reserved/)
  assert.throws(() => claimEdits('done', [], 'w1', true, false), /done card/)
  assert.throws(() => claimEdits('options', [], 'w1', false, true), /child in doing/)
})

test('releasing the last assignee clears assignee, holder and agent, and moves the card to options', () => {
  assert.deepEqual(releaseEdits('doing', ['codex'], 'codex', false), [
    { op: 'set', key: 'status', value: 'options' }, { op: 'remove', key: 'assignee' }, { op: 'remove', key: 'holder' }, { op: 'remove', key: 'agent' },
  ])
})

test('releasing one of several assignees removes only that name, and the card stays where it is', () => {
  assert.deepEqual(releaseEdits('doing', ['Victor', 'w1'], 'W1', false), assigneeIs('Victor'))
  assert.deepEqual(releaseEdits('doing', ['Victor', 'w1', 'w2'], 'w1', false), assigneesAre('Victor', 'w2'))
})

test('releasing the last named assignee leaves a request for any agent, in options', () => {
  assert.deepEqual(releaseEdits('doing', ['w1', 'agent'], 'w1', false),
    [{ op: 'set', key: 'status', value: 'options' }, ...assigneeIs('agent')])
})

test('a release refuses a name that is not assigned to the card', () => {
  assert.throws(() => releaseEdits('doing', ['Victor'], 'w1', false), /w1 is not assigned to/)
})
