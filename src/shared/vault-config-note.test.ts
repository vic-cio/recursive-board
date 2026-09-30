import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseConfigNote, VAULT_CONFIG_NOTE } from './vault-config-note.ts'

const note = `# Vault settings\n\nKeep this text.\n\n<!-- recursive-board-config -->\n\`\`\`json\n{"defaultRoot":"Main","customKey":{"keep":true}}\n\`\`\`\n\nKeep this text too.\n`

test('the config note has a stable, non-hidden vault-root name', () => {
  assert.equal(VAULT_CONFIG_NOTE, 'Recursive Board config.md')
})

test('the marked JSON fence parses settings and unknown keys', () => {
  assert.deepEqual(parseConfigNote(note), { defaultRoot: 'Main', customKey: { keep: true } })
})

test('missing, duplicate, or invalid marked fences fail with note-specific errors', () => {
  assert.throws(() => parseConfigNote('# no config'), /Recursive Board config\.md.*marked JSON/)
  assert.throws(() => parseConfigNote(`${note}\n${note}`), /Recursive Board config\.md.*one marked JSON/)
  assert.throws(() => parseConfigNote(note.replace('"Main"', 'Main')), /Recursive Board config\.md.*valid JSON/)
})
