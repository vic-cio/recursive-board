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
