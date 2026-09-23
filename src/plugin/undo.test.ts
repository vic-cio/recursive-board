/** The undo stack's rules, which are pure and so testable without Obsidian. */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { UndoStack } from './undo.ts'

const edit = (path: string, before: string, after: string, label = 'move x') =>
  ({ kind: 'edit', path, before, after, label }) as const

test('an empty stack has nothing to undo', () => {
  assert.equal(new UndoStack().peek(), undefined)
})

test('undo takes the most recent write first', () => {
  const stack = new UndoStack()
  stack.record(edit('a.md', '1', '2', 'first'))
  stack.record(edit('b.md', '1', '2', 'second'))
  assert.equal(stack.pop()?.label, 'second')
  assert.equal(stack.pop()?.label, 'first')
  assert.equal(stack.pop(), undefined)
})

test('the stack keeps a bounded history, dropping the oldest', () => {
  const stack = new UndoStack(3)
  for (const n of [1, 2, 3, 4]) stack.record(edit(`${n}.md`, '', 'x', `w${n}`))
  assert.deepEqual([stack.pop(), stack.pop(), stack.pop(), stack.pop()].map((e) => e?.label),
    ['w4', 'w3', 'w2', undefined])
})

test('restoring an edit gives back exactly the bytes from before', () => {
  const entry = edit('a.md', '---\nstatus: doing\n---\n', '---\nstatus: done\n---\n')
  assert.equal(UndoStack.restore(entry, entry.after), entry.before)
})

test('restoring refuses when the file changed since, so undo never loses a later edit', () => {
  const entry = edit('a.md', 'before', 'after')
  assert.equal(UndoStack.restore(entry, 'after, then edited on the phone'), null)
})

test('a write that changed nothing is not recorded, so undo never looks like a no-op', () => {
  const stack = new UndoStack()
  stack.record(edit('a.md', 'same', 'same'))
  assert.equal(stack.peek(), undefined)
})

test('a file moved on disk takes its pending undo with it', () => {
  const stack = new UndoStack()
  stack.record(edit('Boards/Old.md', '1', '2'))
  stack.rename('Boards/Old.md', 'Boards/New.md')
  assert.equal(stack.peek()?.path, 'Boards/New.md')
})
