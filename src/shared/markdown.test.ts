import { test } from 'node:test'
import assert from 'node:assert/strict'

import { wrapAnglePlaceholders } from './markdown.ts'

test('wraps bare angle placeholders in Markdown prose', () => {
  assert.equal(
    wrapAnglePlaceholders('Use <port> for <topic-name> and <path/to/file>.'),
    'Use `<port>` for `<topic-name>` and `<path/to/file>`.',
  )
})

test('preserves inline code, fenced code, links, autolinks, and HTML', () => {
  const markdown = [
    'Use `<inline>` and `also <inline>`.',
    '```md',
    'Use <fenced> here.',
    '```',
    '[link](<file name.md>) and <https://example.com/a> and <person@example.com>.',
    '<br> <span class="label">tag</span> <!-- <comment> -->',
  ].join('\n')

  assert.equal(wrapAnglePlaceholders(markdown), markdown)
})

test('wraps placeholders around protected Markdown and remains idempotent', () => {
  const markdown = 'Set <port>, see [the docs](<docs/index.md>), then run `<command>`.'
  const once = 'Set `<port>`, see [the docs](<docs/index.md>), then run `<command>`.'

  assert.equal(wrapAnglePlaceholders(markdown), once)
  assert.equal(wrapAnglePlaceholders(once), once)
})
