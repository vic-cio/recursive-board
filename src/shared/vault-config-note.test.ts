import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mergeDefaultRootNote, parseConfigNote, writeConfigNote, VAULT_CONFIG_NOTE } from './vault-config-note.ts'

const note = `# Vault settings\n\nKeep this text.\n\n<!-- recursive-board-config -->\n\`\`\`json\n{"defaultRoot":"Main","customKey":{"keep":true}}\n\`\`\`\n\nKeep this text too.\n`

test('the config note has a stable, non-hidden vault-root name', () => {
  assert.equal(VAULT_CONFIG_NOTE, 'Recursive Board config.md')
})

test('the marked JSON fence parses settings and unknown keys', () => {
  assert.deepEqual(parseConfigNote(note), { defaultRoot: 'Main', customKey: { keep: true } })
})

test('updating the config preserves note text and unknown config keys', () => {
  const updated = writeConfigNote(note, { defaultRoot: 'Next', customKey: { keep: true }, areaTags: true })
  assert.equal(updated, note.replace('{"defaultRoot":"Main","customKey":{"keep":true}}',
    '{\n  "defaultRoot": "Next",\n  "customKey": {\n    "keep": true\n  },\n  "areaTags": true\n}'))
})

test('setting the default root preserves text and unknown config keys', () => {
  const updated = mergeDefaultRootNote(note, 'Next')
  assert.equal(updated, note.replace('"Main"', '"Next"'))
  assert.deepEqual(parseConfigNote(updated), { defaultRoot: 'Next', customKey: { keep: true } })
})

test('a new config note contains one marked JSON fence', () => {
  const created = writeConfigNote(null, { defaultRoot: 'Main' })
  assert.match(created, /<!-- recursive-board-config -->\n```json\n\{[\s\S]*\}\n```/)
  assert.equal((created.match(/<!-- recursive-board-config -->/g) ?? []).length, 1)
})

test('missing, duplicate, or invalid marked fences fail with note-specific errors', () => {
  assert.throws(() => parseConfigNote('# no config'), /Recursive Board config\.md.*marked JSON/)
  assert.throws(() => parseConfigNote(`${note}\n${note}`), /Recursive Board config\.md.*one marked JSON/)
  assert.throws(() => parseConfigNote(note.replace('"Main"', 'Main')), /Recursive Board config\.md.*valid JSON/)
})
