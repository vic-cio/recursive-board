import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isVaultConfigEvent } from './vault-config-note.ts'

test('create, modify, and delete events reload the active config note', () => {
  for (const kind of ['create', 'modify', 'delete'] as const) {
    assert.equal(isVaultConfigEvent({ kind, path: 'Recursive Board config.md' }), true)
    assert.equal(isVaultConfigEvent({ kind, path: 'Notes/other.md' }), false)
  }
})

test('rename events reload when the config note is the old or new path', () => {
  assert.equal(isVaultConfigEvent({ kind: 'rename', oldPath: 'Recursive Board config.md', path: 'Settings.md' }), true)
  assert.equal(isVaultConfigEvent({ kind: 'rename', oldPath: 'Settings.md', path: 'Recursive Board config.md' }), true)
  assert.equal(isVaultConfigEvent({ kind: 'rename', oldPath: 'Notes/a.md', path: 'Notes/b.md' }), false)
})
