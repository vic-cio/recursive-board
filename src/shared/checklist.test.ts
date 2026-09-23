import { test } from 'node:test'
import assert from 'node:assert/strict'

import { checklistMarkdown, escapeInline } from './checklist.ts'

test('a checklist is a Markdown task list, one line per child, in the order given', () => {
  const md = checklistMarkdown([
    { title: 'Build server', path: 'Boards/Build server.md', done: false },
    { title: 'Draft the spec', path: 'Boards/Draft the spec.md', done: true },
  ])
  assert.equal(md, [
    '- [ ] [Build server](<Boards/Build server.md>)',
    '- [x] [Draft the spec](<Boards/Draft the spec.md>)',
  ].join('\n'))
})

test('a title that looks like list syntax stays text (rendering risk 4)', () => {
  const md = checklistMarkdown([{ title: '- [x] done', path: 'Boards/x.md', done: false }])
  assert.equal(md, '- [ ] [\\- \\[x\\] done](<Boards/x.md>)')
})

test('escapeInline escapes every ASCII punctuation mark, so no title can become syntax', () => {
  assert.equal(escapeInline('a|b *c* `d` [[e]] #f <g>'), 'a\\|b \\*c\\* \\`d\\` \\[\\[e\\]\\] \\#f \\<g\\>')
})

test('escapeInline folds line breaks, so a title cannot start a new list item', () => {
  assert.equal(escapeInline('one\n- two'), 'one \\- two')
})

test('a path with parentheses survives inside the angle-bracket destination', () => {
  const md = checklistMarkdown([
    { title: 'Render lists (R1)', path: 'Boards/Render lists (R1).md', done: false },
  ])
  assert.equal(md, '- [ ] [Render lists \\(R1\\)](<Boards/Render lists (R1).md>)')
})

test('an empty list is an empty string', () => {
  assert.equal(checklistMarkdown([]), '')
})
