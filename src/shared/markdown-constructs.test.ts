import { test } from 'node:test'
import assert from 'node:assert/strict'

import { wrapAnglePlaceholders } from './markdown.ts'

test('preserves angle destinations in Markdown reference definitions', () => {
  const markdown = '[link]: <relative-path>\n\nUse <topic>.'

  assert.equal(wrapAnglePlaceholders(markdown), '[link]: <relative-path>\n\nUse `<topic>`.')
})

test('wraps placeholders after an unmatched backtick run', () => {
  const markdown = 'An unmatched ` marker precedes <port>.\nNext line has <topic>.'

  assert.equal(wrapAnglePlaceholders(markdown), 'An unmatched ` marker precedes `<port>`.\nNext line has `<topic>`.')
})

test('wraps placeholders after an escaped backtick', () => {
  const markdown = 'An escaped \\` marker precedes <port>.'

  assert.equal(wrapAnglePlaceholders(markdown), 'An escaped \\` marker precedes `<port>`.')
})

test('preserves HTML element content and wraps placeholders after the element', () => {
  const markdown = '<script>const x = "<port>";</script> Then use <topic>.'

  assert.equal(wrapAnglePlaceholders(markdown), '<script>const x = "<port>";</script> Then use `<topic>`.')
})

test('preserves a multiline code span and wraps prose after its closing run', () => {
  const markdown = ['Before <first>.', '`const x =', '  "<inside>"', '` remains code.', 'After <last>.'].join('\n')
  const expected = ['Before `<first>`.', '`const x =', '  "<inside>"', '` remains code.', 'After `<last>`.'].join('\n')

  assert.equal(wrapAnglePlaceholders(markdown), expected)
})
