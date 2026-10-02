import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duplicateProcedures, isRoleTag, procedureNotes, roleTagFor, roleTags, type TaggedNote } from './role-tags.ts'

test('a role tag is a tag under role/, in any case, with or without #', () => {
  assert.equal(isRoleTag('role/checker'), true)
  assert.equal(isRoleTag('#Role/Checker'), true)
  assert.equal(isRoleTag('role/'), false)
  assert.equal(isRoleTag('roles/checker'), false)
  assert.equal(isRoleTag('web'), false)
})

test('roleTags keeps list order and drops repeats and other tags', () => {
  assert.deepEqual(roleTags(['web', '#role/coder', 'role/checker', 'Role/Coder']), ['role/coder', 'role/checker'])
})

test('roleTagFor turns a role name into its tag', () => {
  assert.equal(roleTagFor('Takeoff agent'), 'role/takeoff-agent')
  assert.equal(roleTagFor('Checker'), 'role/checker')
  assert.equal(roleTagFor('#role/project-lead'), 'role/project-lead')
  assert.throws(() => roleTagFor(' '), /needs a name/)
  assert.throws(() => roleTagFor('a.b'), /not a tag/)
})

const notes: TaggedNote[] = [
  { path: 'Roles/Checker.md', tags: ['role/checker'], workItem: false },
  { path: 'Boards/Check the sample.md', tags: ['role/checker'], workItem: true },
  { path: 'Knowledge/Old checker.md', tags: ['#Role/Checker', 'vault'], workItem: false },
  { path: 'Roles/Coder.md', tags: ['role/coder'], workItem: false },
]

test('the procedure notes for a role tag are the notes, not cards, that carry it', () => {
  assert.deepEqual(procedureNotes('role/coder', notes), ['Roles/Coder.md'])
  assert.deepEqual(procedureNotes('#role/checker', notes), ['Knowledge/Old checker.md', 'Roles/Checker.md'])
  assert.deepEqual(procedureNotes('role/takeoff-agent', notes), [])
})

test('duplicateProcedures lists only a role tag that two procedure notes carry', () => {
  assert.deepEqual([...duplicateProcedures(notes)], [['role/checker', ['Knowledge/Old checker.md', 'Roles/Checker.md']]])
})
