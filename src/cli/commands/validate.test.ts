import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { validate, type Problem } from './validate.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

/** A vault that must come back clean. Every test starts here and breaks one thing. */
function healthy(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-22',
  }, '# Main\n'))
  f.write('Boards/Build server.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Build server', status: 'doing',
    parent: '"[[Main]]"', owner: 'sam', priority: 2,
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Build server\n'))
  f.write('Boards/Streaming.md', item({
    type: 'work-item', id: 'wi-0005', title: 'Streaming', status: 'done',
    parent: '"[[Build server]]"', prev_status: 'doing',
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Streaming\n'))
  return f
}

async function run(f: Fixture) {
  return validate(await loadVault(f.root))
}

const rules = (problems: Problem[]) => problems.map((p) => p.rule)

test('a healthy vault reports nothing', async () => {
  fixture = healthy()
  const report = await run(fixture)
  assert.deepEqual(report.problems, [])
  assert.equal(report.ok, true)
  assert.equal(report.errorCount, 0)
})

test('the four statuses and a root without one are all accepted', async () => {
  fixture = healthy()
  for (const [i, status] of ['backlog', 'options', 'doing', 'done'].entries()) {
    fixture.write(`Boards/Item ${i}.md`, item({
      type: 'work-item', id: `wi-10${i}`, title: `Item ${i}`, status,
      parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
    }))
  }
  assert.deepEqual((await run(fixture)).problems, [])
})

test('a fifth status value is an error (spec section 12)', async () => {
  fixture = healthy()
  fixture.write('Boards/Bad.md', item({
    type: 'work-item', id: 'wi-0009', title: 'Bad', status: 'active',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const report = await run(fixture)
  assert.ok(rules(report.problems).includes('status-invalid'))
  assert.equal(report.ok, false)
})

test('a status on a root is an error, because a root is nobody card', async () => {
  fixture = healthy()
  fixture.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main', status: 'doing',
    created: '2026-09-21', updated: '2026-09-22',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('status-on-root'))
})

test('a non-root without a status is an error', async () => {
  fixture = healthy()
  fixture.write('Boards/Nostatus.md', item({
    type: 'work-item', id: 'wi-0010', title: 'Nostatus',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('status-missing'))
})

test('an unresolved parent is reported, and the item is left alone', async () => {
  fixture = healthy()
  const path = fixture.write('Boards/Orphan.md', item({
    type: 'work-item', id: 'wi-0016', title: 'Orphan', status: 'doing',
    parent: '"[[Build app prototype]]"', created: '2026-08-02', updated: '2026-08-09',
  }))
  const report = await run(fixture)
  const problem = report.problems.find((p) => p.rule === 'parent-unresolved')
  assert.ok(problem)
  assert.equal(problem.relPath, 'Boards/Orphan.md')
  assert.match(problem.message, /Build app prototype/)
  const { readFileSync } = await import('node:fs')
  assert.match(readFileSync(path, 'utf8'), /Build app prototype/, 'nothing was repaired')
})

test('a parent that is not a wikilink is an error', async () => {
  fixture = healthy()
  fixture.write('Boards/Plain.md', item({
    type: 'work-item', id: 'wi-0011', title: 'Plain', status: 'backlog',
    parent: 'Main', created: '2026-09-21', updated: '2026-09-21',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('parent-malformed'))
})

test('an item that is its own parent is an error', async () => {
  fixture = healthy()
  fixture.write('Boards/Selfish.md', item({
    type: 'work-item', id: 'wi-0012', title: 'Selfish', status: 'backlog',
    parent: '"[[Selfish]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('cycle'))
})

test('a parent cycle is reported once per item and does not hang', async () => {
  fixture = healthy()
  fixture.write('Boards/A.md', item({
    type: 'work-item', id: 'wi-00a', title: 'A', status: 'backlog',
    parent: '"[[B]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  fixture.write('Boards/B.md', item({
    type: 'work-item', id: 'wi-00b', title: 'B', status: 'backlog',
    parent: '"[[A]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const report = await run(fixture)
  assert.equal(report.problems.filter((p) => p.rule === 'cycle').length, 2)
})

test('a duplicate id is an error, and names both files', async () => {
  fixture = healthy()
  fixture.write('Boards/Twin.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Twin', status: 'backlog',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const problem = (await run(fixture)).problems.find((p) => p.rule === 'id-duplicate')
  assert.ok(problem)
  assert.match(problem.message, /Build server/)
  assert.match(problem.message, /Twin/)
})

test('a missing id is an error, because the id is what recovers the hierarchy', async () => {
  fixture = healthy()
  fixture.write('Boards/Noid.md', item({
    type: 'work-item', title: 'Noid', status: 'backlog',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('id-missing'))
})

test('a malformed id is an error', async () => {
  fixture = healthy()
  fixture.write('Boards/Badid.md', item({
    type: 'work-item', id: 'TASK-77', title: 'Badid', status: 'backlog',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('id-malformed'))
})

test('a missing title is an error', async () => {
  fixture = healthy()
  fixture.write('Boards/Untitled.md', item({
    type: 'work-item', id: 'wi-0013', status: 'backlog',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('title-missing'))
})

test('board false is an error, because demotion deletes the key', async () => {
  fixture = healthy()
  fixture.write('Boards/Demoted.md', item({
    type: 'work-item', id: 'wi-0015', title: 'Demoted', status: 'backlog',
    parent: '"[[Main]]"', board: false, created: '2026-09-21', updated: '2026-09-21',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('board-false'))
})

test('board true is accepted', async () => {
  fixture = healthy()
  fixture.write('Boards/Promoted.md', item({
    type: 'work-item', id: 'wi-0017', title: 'Promoted', status: 'backlog',
    parent: '"[[Main]]"', board: true, created: '2026-09-21', updated: '2026-09-21',
  }))
  assert.deepEqual((await run(fixture)).problems, [])
})

test('validation reports configured folder rather than Boards for an empty vault', async () => {
  fixture = healthy()
  fixture.write('.wi.json', '{"workItemFolder":"Projects"}')
  const report = await run(fixture)
  assert.ok(report.problems.some((p) => p.rule === 'root-missing' && p.relPath === 'Projects'))
})

test('an invalid prev_status is an error', async () => {
  fixture = healthy()
  fixture.write('Boards/Ticked.md', item({
    type: 'work-item', id: 'wi-0018', title: 'Ticked', status: 'done',
    parent: '"[[Main]]"', prev_status: 'active',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('prev-status-invalid'))
})

test('prev_status on an item that is not done is a warning, not an error', async () => {
  fixture = healthy()
  fixture.write('Boards/Stale.md', item({
    type: 'work-item', id: 'wi-0019', title: 'Stale', status: 'doing',
    parent: '"[[Main]]"', prev_status: 'backlog',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  const report = await run(fixture)
  const problem = report.problems.find((p) => p.rule === 'prev-status-stale')
  assert.ok(problem)
  assert.equal(problem.severity, 'warning')
  assert.equal(report.ok, true, 'a warning does not fail the vault')
})

test('a bad date is an error', async () => {
  fixture = healthy()
  fixture.write('Boards/Dated.md', item({
    type: 'work-item', id: 'wi-0021', title: 'Dated', status: 'backlog',
    parent: '"[[Main]]"', created: '21/09/2026', updated: '2026-09-21',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('date-invalid'))
})

test('a missing date is an error, because both the sort and the Done window need it', async () => {
  fixture = healthy()
  fixture.write('Boards/Undated.md', item({
    type: 'work-item', id: 'wi-0022', title: 'Undated', status: 'backlog',
    parent: '"[[Main]]"',
  }))
  assert.ok(rules((await run(fixture)).problems).includes('date-missing'))
})

test('an unknown key is a warning, never an error, because it must be preserved', async () => {
  fixture = healthy()
  fixture.write('Boards/Extra.md', item({
    type: 'work-item', id: 'wi-0023', title: 'Extra', status: 'backlog',
    parent: '"[[Main]]"', something_nobody_knows: 42,
    created: '2026-09-21', updated: '2026-09-21',
  }))
  const report = await run(fixture)
  const problem = report.problems.find((p) => p.rule === 'unknown-key')
  assert.ok(problem)
  assert.equal(problem.severity, 'warning')
  assert.equal(report.ok, true)
})

test('an optional field is not an unknown key', async () => {
  fixture = healthy()
  fixture.write('Boards/Full.md', item({
    type: 'work-item', id: 'wi-0024', title: 'Full', status: 'backlog',
    parent: '"[[Main]]"', owner: 'sam', agent: 'codex', priority: 1,
    due: '2026-10-01', blocked: true, created: '2026-09-21', updated: '2026-09-21',
  }))
  assert.deepEqual((await run(fixture)).problems, [])
})

test('a Markdown file nested below Boards is an error (decision D8)', async () => {
  fixture = healthy()
  fixture.write('Boards/Project/Nested.md', item({
    type: 'work-item', id: 'wi-0025', title: 'Nested', status: 'backlog', parent: '"[[Main]]"',
  }))
  const problem = (await run(fixture)).problems.find((p) => p.rule === 'folder-nested')
  assert.ok(problem)
  assert.equal(problem.severity, 'error')
})

test('an iCloud placeholder is a warning, and never a reason to rewrite anything', async () => {
  fixture = healthy()
  fixture.write('Boards/.Build server.md.icloud', '')
  const problem = (await run(fixture)).problems.find((p) => p.rule === 'icloud-evicted')
  assert.ok(problem)
  assert.equal(problem.severity, 'warning')
  assert.match(problem.message, /download/i)
})

test('validate never looks at Intake, which is no longer a product folder (L5)', async () => {
  fixture = healthy()
  fixture.write('Intake/scratch.md', 'no frontmatter, no rules, status: active, [[nonsense]]\n')
  fixture.write('Intake/untitled.md', '---\ntype: work-item\nstatus: banana\n---\n')
  assert.deepEqual((await run(fixture)).problems, [])
})

test('a nested file under Knowledge is no longer checked (L5 cost)', async () => {
  fixture = healthy()
  fixture.write('Knowledge/Topic/Nested.md', 'no rules apply here\n')
  assert.deepEqual((await run(fixture)).problems, [])
})

test('a nested file under Templates is still an error, since Templates is a product folder', async () => {
  fixture = healthy()
  fixture.write('Templates/Project/Nested.md', item({
    type: 'work-item', id: 'wi-0027', title: 'Nested', status: 'backlog', parent: '"[[Main]]"',
  }))
  const problem = (await run(fixture)).problems.find((p) => p.rule === 'folder-nested')
  assert.ok(problem)
  assert.equal(problem.severity, 'error')
})

test('validate does not apply the work-item schema to Knowledge or Templates', async () => {
  fixture = healthy()
  fixture.write('Knowledge/App Protocol.md', '---\ntags: [protocol]\n---\n\n# App\n')
  fixture.write('Templates/work-item.md', item({
    type: 'work-item', id: 'wi-XXXX', title: '', status: 'backlog', parent: '"[[Main]]"',
  }))
  assert.deepEqual((await run(fixture)).problems, [])
})

test('a Markdown file in Boards that is not a work item is a warning', async () => {
  fixture = healthy()
  fixture.write('Boards/loose note.md', '# Not a work item\n')
  const problem = (await run(fixture)).problems.find((p) => p.rule === 'not-a-work-item')
  assert.ok(problem)
  assert.equal(problem.severity, 'warning')
})

test('no root at all is a warning, because an empty vault is not corrupt', async () => {
  fixture = makeVault()
  const report = await run(fixture)
  const problem = report.problems.find((p) => p.rule === 'root-missing')
  assert.ok(problem)
  assert.equal(problem.severity, 'warning')
  assert.equal(report.ok, true)
})

test('a second root is a warning, since the model does not forbid one', async () => {
  fixture = healthy()
  fixture.write('Boards/Other root.md', item({
    type: 'work-item', id: 'wi-0026', title: 'Other root',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  const problem = (await run(fixture)).problems.find((p) => p.rule === 'root-multiple')
  assert.ok(problem)
  assert.equal(problem.severity, 'warning')
})

test('problems come back sorted by file, so the report reads in vault order', async () => {
  fixture = healthy()
  fixture.write('Boards/Zeta.md', item({
    type: 'work-item', id: 'wi-0027', title: 'Zeta', status: 'nope', parent: '"[[Main]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  fixture.write('Boards/Alpha.md', item({
    type: 'work-item', id: 'wi-0028', title: 'Alpha', status: 'nope', parent: '"[[Main]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  const paths = (await run(fixture)).problems.map((p) => p.relPath)
  assert.deepEqual(paths, [...paths].sort())
})

test('every problem names a file and carries a rule and a severity', async () => {
  fixture = healthy()
  fixture.write('Boards/Mess.md', item({
    type: 'work-item', id: 'NOPE', status: 'banana', parent: 'Main', board: false,
  }))
  const report = await run(fixture)
  assert.ok(report.problems.length >= 4)
  for (const p of report.problems) {
    assert.ok(p.relPath.length > 0)
    assert.ok(p.rule.length > 0)
    assert.ok(['error', 'warning'].includes(p.severity))
    assert.ok(p.message.length > 0)
  }
})
