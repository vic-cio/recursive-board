import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync, readdirSync, lstatSync, symlinkSync } from 'node:fs'
import { join, relative } from 'node:path'
import { makeVault } from '../test-helpers.ts'

const cli = fileURLToPath(new URL('../wi.ts', import.meta.url))
function run(root: string, extra: string[] = []) {
  return spawnSync(process.execPath, [cli, 'trace', 'Knowledge/Origin.md', '--heading', 'Rule', '--claim', 'copied claim', '--vault', root, ...extra], {
    encoding: 'utf8', env: { ...process.env, WI_CARD: '', WI_AGENT: '' },
  })
}
function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {}
  function walk(folder: string) {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name)
      if (lstatSync(path).isDirectory()) walk(path)
      else if (lstatSync(path).isFile()) result[relative(root, path)] = readFileSync(path).toString('hex')
    }
  }
  walk(root)
  return result
}
function seed() {
  const f = makeVault()
  f.write('Knowledge/Origin.md', '## Rule\nThe copied claim is now corrected.\n')
  return f
}
function read(result: ReturnType<typeof run>): unknown {
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test('trace reports heading consumers and older unlinked copies without editing files', () => {
  const f = seed()
  try {
    f.write('Knowledge/Linked.md', 'See [[Origin#Rule|the source]].\nThe copied claim appeared here.\n')
    f.write('Boards/Copy.md', 'The COPIED CLAIM appeared here.\n')
    f.write('Knowledge/Note only.md', 'See [[Origin]].\n')
    f.write('Knowledge/Other.md', 'See [[Other#Rule]].\n')
    const before = snapshot(f.root)
    assert.deepEqual(read(run(f.root, ['--json'])), {
      source: { path: 'Knowledge/Origin.md', heading: 'Rule' }, claim: 'copied claim',
      linkedConsumers: [{ path: 'Knowledge/Linked.md', line: 1 }],
      noteLinks: [{ path: 'Knowledge/Note only.md', line: 1 }],
      unlinkedMatches: [{ path: 'Boards/Copy.md', line: 1, text: 'The COPIED CLAIM appeared here.' }],
      scope: { folders: ['Knowledge', 'Boards'], filesRead: 5 },
      gaps: ['Text search can miss paraphrases and older copies.', 'Files outside the scanned folders, including external skills and memory, were not searched.'],
      record: { affectedFiles: [], correctionEvidence: '', unresolvedCopies: [], searchGaps: [] },
    })
    assert.deepEqual(snapshot(f.root), before)
  } finally { f.cleanup() }
})

test('trace resolves relative Markdown links and encoded headings', () => {
  const f = seed()
  try {
    f.write('Boards/Linked.md', '[source](../Knowledge/Origin.md#Rule)\n[source](../Knowledge/Origin.md#Ru%6Ce)\n')
    const output = read(run(f.root, ['--json']))
    assert.ok(output && typeof output === 'object' && 'linkedConsumers' in output)
    assert.deepEqual(output.linkedConsumers, [{ path: 'Boards/Linked.md', line: 1 }, { path: 'Boards/Linked.md', line: 2 }])
  } finally { f.cleanup() }
})

test('trace treats a note link with copied text as an unverified copy candidate', () => {
  const f = seed()
  try {
    f.write('Knowledge/Copy.md', '[[Origin]]\nThe copied claim appears here.\n')
    const output = read(run(f.root, ['--json']))
    assert.ok(output && typeof output === 'object' && 'unlinkedMatches' in output)
    assert.deepEqual(output.unlinkedMatches, [{ path: 'Knowledge/Copy.md', line: 2, text: 'The copied claim appears here.' }])
  } finally { f.cleanup() }
})

test('trace uses the configured work item folder and reports its search scope', () => {
  const f = seed()
  try {
    f.write('.wi.json', '{"workItemFolder":"Work"}')
    f.write('Work/Copy.md', 'copied claim\n')
    f.write('Boards/Excluded.md', 'copied claim\n')
    f.write('Notebook/Excluded.md', 'copied claim\n')
    const output = read(run(f.root, ['--json']))
    assert.ok(output && typeof output === 'object' && 'scope' in output && 'unlinkedMatches' in output)
    assert.deepEqual(output.scope, { folders: ['Knowledge', 'Work'], filesRead: 2 })
    assert.deepEqual(output.unlinkedMatches, [{ path: 'Work/Copy.md', line: 1, text: 'copied claim' }])
  } finally { f.cleanup() }
})

test('trace refuses a missing source heading rather than guessing the passage', () => {
  const f = seed()
  try {
    f.write('Knowledge/Origin.md', '## Different\ncopied claim\n')
    const r = run(f.root, ['--json'])
    assert.equal(r.status, 2)
    assert.match(r.stderr, /source heading.*Rule.*not found/i)
  } finally { f.cleanup() }
})

test('trace refuses a source outside the vault and does not follow scan symlinks', () => {
  const f = seed(), outside = makeVault()
  try {
    outside.write('Outside.md', 'copied claim\n')
    symlinkSync(join(outside.root, 'Outside.md'), join(f.root, 'Knowledge/External.md'))
    const output = read(run(f.root, ['--json']))
    assert.ok(output && typeof output === 'object' && 'unlinkedMatches' in output && 'gaps' in output)
    assert.deepEqual(output.unlinkedMatches, [])
    assert.ok(Array.isArray(output.gaps) && output.gaps.some((g: unknown) => typeof g === 'string' && g.includes('External.md')))
    const r = spawnSync(process.execPath, [cli, 'trace', join(outside.root, 'Outside.md'), '--heading', 'Rule', '--claim', 'copied claim', '--vault', f.root], { encoding: 'utf8' })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /source.*inside.*vault/i)
  } finally { f.cleanup(); outside.cleanup() }
})

test('trace keeps ambiguous source-name links visible as search gaps', () => {
  const f = seed()
  try {
    f.write('Boards/Origin.md', '## Rule\nanother source\n')
    f.write('Knowledge/Linked.md', '[[Origin#Rule]]\n[[Knowledge/Origin#Rule]]\n')
    const output = read(run(f.root, ['--json']))
    assert.ok(output && typeof output === 'object' && 'linkedConsumers' in output && 'gaps' in output)
    assert.deepEqual(output.linkedConsumers, [{ path: 'Knowledge/Linked.md', line: 2 }])
    assert.ok(Array.isArray(output.gaps) && output.gaps.some((g: unknown) => typeof g === 'string' && g.includes('ambiguous') && g.includes('Origin')))
  } finally { f.cleanup() }
})

test('trace emits a Markdown review record with evidence and unresolved-copy fields', () => {
  const f = seed()
  try {
    const r = run(f.root)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /Knowledge correction trace/)
    for (const heading of ['Linked consumers', 'Unlinked text candidates', 'Search gaps', 'Affected files', 'Correction evidence', 'Unresolved copies']) assert.ok(r.stdout.includes(heading), heading)
    assert.match(r.stdout, /can miss paraphrases/)
  } finally { f.cleanup() }
})
