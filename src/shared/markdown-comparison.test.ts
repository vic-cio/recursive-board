import { test } from 'node:test'
import assert from 'node:assert/strict'

import { wrapAnglePlaceholders } from './markdown.ts'

test('wraps placeholders after less-than comparison text', () => {
  assert.equal(
    wrapAnglePlaceholders('Use a < b and <port>.'),
    'Use a < b and `<port>`.',
  )
})
