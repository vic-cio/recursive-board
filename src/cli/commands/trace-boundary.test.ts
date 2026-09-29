import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeVault } from '../test-helpers.ts'
const cli = fileURLToPath(new URL('../wi.ts', import.meta.url))
function run(root: string) {
  return spawnSync(process.execPath, [cli, 'trace', 'Knowledge/Origin.md', '--heading', 'Rule', '--claim', 'copied claim', '--vault', root, '--json'], { encoding: 'utf8' })
}
test('trace rejects a heading which exists only inside a fenced example', () => {
  const f = makeVault()
  try {
    f.write('Knowledge/Origin.md', '```md\n## Rule\ncopied claim\n```\n')
    const r = run(f.root)
    assert.equal(r.status, 2)
    assert.match(r.stderr, /source heading.*not found/i)
  } finally { f.cleanup() }
})
test('trace skips a symbolic scan folder and records the coverage gap', () => {
  const f = makeVault(), outside = makeVault()
  try {
    f.write('.wi.json', '{"workItemFolder":"Work"}')
    f.write('Knowledge/Origin.md', '## Rule\ncopied claim\n')
    outside.write('External.md', 'copied claim\n')
    symlinkSync(outside.root, join(f.root, 'Work'))
    const r = run(f.root)
    assert.equal(r.status, 0, r.stderr)
    const report: unknown = JSON.parse(r.stdout)
    assert.ok(report && typeof report === 'object' && 'unlinkedMatches' in report && 'gaps' in report && 'scope' in report)
    assert.deepEqual(report.unlinkedMatches, [])
    assert.deepEqual(report.scope, { folders: ['Knowledge', 'Work'], filesRead: 1 })
    assert.ok(Array.isArray(report.gaps) && report.gaps.some((g: unknown) => typeof g === 'string' && g.includes('Work')))
  } finally { f.cleanup(); outside.cleanup() }
})
