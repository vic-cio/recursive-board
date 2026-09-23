import { test } from 'node:test'
import assert from 'node:assert/strict'

import { appendNote } from './notes.ts'

test('appendNote adds a line after a bare Notes heading', () => {
  assert.equal(appendNote('## Notes', '- Released.'), '## Notes\n\n- Released.\n')
})

test('appendNote preserves CRLF and keeps the next section separate', () => {
  const before = '## Notes\r\n\r\nHuman note.\r\n\r\n## Next\r\nKeep this.\r\n'
  const after = appendNote(before, '- Released.')
  assert.equal(after, '## Notes\r\n\r\nHuman note.\r\n- Released.\r\n\r\n## Next\r\nKeep this.\r\n')
})

test('appendNote ignores a Notes heading inside a code fence', () => {
  const before = '## Objective\n\n```md\n## Notes\nExample.\n```\n\n## Notes\n\nHuman note.\n'
  const after = appendNote(before, '- Released.')
  assert.equal(after, '## Objective\n\n```md\n## Notes\nExample.\n```\n\n## Notes\n\nHuman note.\n- Released.\n')
})
