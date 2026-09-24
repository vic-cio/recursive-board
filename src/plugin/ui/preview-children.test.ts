import { test } from 'node:test'
import assert from 'node:assert/strict'

import { previewChildren } from './preview-children.ts'

const child = (title: string, status: string, effectiveArchived = false) =>
  ({ title, status, effectiveArchived }) as never

test('an expanded card lists open children and folds done ones into a count', () => {
  const children = [child('A', 'backlog'), child('B', 'done'), child('C', 'doing'), child('D', 'done')]
  const { open, doneCount } = previewChildren(children, false)
  assert.deepEqual(open.map((c: { title: string }) => c.title), ['A', 'C'])
  assert.equal(doneCount, 2)
})

test('an archived done child counts only while archived items show', () => {
  const children = [child('A', 'done'), child('B', 'done', true)]
  assert.equal(previewChildren(children, false).doneCount, 1)
  assert.equal(previewChildren(children, true).doneCount, 2)
})
