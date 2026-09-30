import { test } from 'node:test'
import assert from 'node:assert/strict'

import { validate } from './validate.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item } from '../test-helpers.ts'

for (const source of ['.wi.json', 'Recursive Board config.md']) {
  test(`an unresolved default root warning names its active config file: ${source}`, async () => {
    const fixture = makeVault()
    try {
      fixture.write('Boards/Main.md', item({
        type: 'work-item', id: 'wi-root', title: 'Main',
        created: '2026-09-21', updated: '2026-09-21',
      }))
      fixture.write('.wi.json', '{"defaultRoot":"Missing legacy root"}')
      if (source === 'Recursive Board config.md') {
        fixture.write(source, '<!-- recursive-board-config -->\n```json\n{"defaultRoot":"Missing note root"}\n```\n')
      }

      const report = await validate(await loadVault(fixture.root))
      const warning = report.problems.find((problem) => problem.rule === 'default-root-unresolved')
      assert.ok(warning)
      assert.equal(warning.relPath, source)
      assert.equal(warning.severity, 'warning')
      assert.match(warning.message, source === '.wi.json' ? /Missing legacy root/ : /Missing note root/)
    } finally {
      fixture.cleanup()
    }
  })
}

test('validate warns about an old config file left next to the board key', async () => {
  const fixture = makeVault()
  try {
    fixture.write('.obsidian/plugins/recursive-board/data.json', '{"board":{}}')
    fixture.write('Recursive Board config.md', '<!-- recursive-board-config -->\n```json\n{}\n```\n')
    fixture.write('.wi.json', '{}')
    const report = await validate(await loadVault(fixture.root))
    const leftovers = report.problems.filter((problem) => problem.rule === 'config-leftover')
    assert.deepEqual(leftovers.map((problem) => [problem.relPath, problem.severity]), [
      ['.wi.json', 'warning'],
      ['Recursive Board config.md', 'warning'],
    ])
  } finally {
    fixture.cleanup()
  }
})

test('an unresolved default root warning names the plugin data file when the board key sets it', async () => {
  const fixture = makeVault()
  try {
    fixture.write('.obsidian/plugins/recursive-board/data.json', '{"board":{"defaultRoot":"Missing"}}')
    const report = await validate(await loadVault(fixture.root))
    const warning = report.problems.find((problem) => problem.rule === 'default-root-unresolved')
    assert.equal(warning?.relPath, '.obsidian/plugins/recursive-board/data.json')
  } finally {
    fixture.cleanup()
  }
})
