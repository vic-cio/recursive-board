import { test } from 'node:test'
import assert from 'node:assert/strict'

import { validate } from './validate.ts'
import { loadVault } from '../../cli/vault.ts'
import { makeVault } from '../../cli/test-helpers.ts'

test('validate says nothing about an old config file: wi does not read it', async () => {
  const fixture = makeVault()
  try {
    fixture.writeSettings('{}')
    fixture.write('Recursive Board config.md', '<!-- recursive-board-config -->\n```json\n{}\n```\n')
    fixture.write('.wi.json', '{}')
    const report = await validate(await loadVault(fixture.root))
    assert.deepEqual(report.problems.filter((problem) => /wi\.json|config\.md/.test(problem.relPath)), [])
  } finally {
    fixture.cleanup()
  }
})

test('an unresolved default root warning names the plugin data file', async () => {
  const fixture = makeVault()
  try {
    fixture.writeSettings('{"defaultRoot":"Missing"}')
    const report = await validate(await loadVault(fixture.root))
    const warning = report.problems.find((problem) => problem.rule === 'default-root-unresolved')
    assert.equal(warning?.relPath, '.obsidian/plugins/recursive-board/data.json')
    assert.equal(warning?.severity, 'warning')
    assert.match(warning?.message ?? '', /Missing/)
  } finally {
    fixture.cleanup()
  }
})
