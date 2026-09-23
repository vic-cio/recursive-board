import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { createItem } from './new.ts'
import { loadVault } from '../vault.ts'
import { parseFrontmatter } from '../../shared/frontmatter.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Main\n'))
  f.write('Boards/Build server.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Build server', status: 'doing',
    parent: '"[[Main]]"', owner: 'sam', agent: 'codex',
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Build server\n'))
  return f
}

async function reload(f: Fixture) {
  return loadVault(f.root)
}

test('createItem writes a file into Boards with the nine-field shape', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })

  assert.equal(created.relPath, 'Boards/Streaming.md')
  const fm = parseFrontmatter(readFileSync(created.path, 'utf8'))!
  assert.equal(fm.get('type'), 'work-item')
  assert.match(String(fm.get('id')), /^wi-[a-z0-9]{4}$/)
  assert.equal(fm.get('title'), 'Streaming')
  assert.equal(fm.get('status'), 'backlog')
  assert.equal(fm.get('parent'), '[[Build server]]')
  assert.match(String(fm.get('created')), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(fm.get('created'), fm.get('updated'))
})

test('createItem uses the configured folder and root when no parent is given', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"workItemFolder":"Projects","defaultRoot":"Launch"}')
  fixture.write('Projects/Launch.md', item({
    type: 'work-item', id: 'wi-0100', title: 'Launch', created: '2026-09-21', updated: '2026-09-21',
  }))
  const created = await createItem(await reload(fixture), { title: 'Plan' })
  assert.equal(created.relPath, 'Projects/Plan.md')
  assert.equal(parseFrontmatter(readFileSync(created.path, 'utf8'))!.get('parent'), '[[Launch]]')
})

test('createItem never writes board or prev_status on a fresh item', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })
  const fm = parseFrontmatter(readFileSync(created.path, 'utf8'))!
  assert.equal(fm.has('board'), false, 'absence means not a board')
  assert.equal(fm.has('prev_status'), false)
})

test('createItem inherits owner and agent from the parent (decision u7)', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })
  const fm = parseFrontmatter(readFileSync(created.path, 'utf8'))!
  assert.equal(fm.get('owner'), 'sam')
  assert.equal(fm.get('agent'), 'codex')
})

test('createItem does not invent owner or agent when the parent has none', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Top level', parent: 'wi-0001' })
  const fm = parseFrontmatter(readFileSync(created.path, 'utf8'))!
  assert.equal(fm.has('owner'), false)
  assert.equal(fm.has('agent'), false)
})

test('an explicit owner beats the inherited one', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Streaming', parent: 'wi-0004', owner: 'codex',
  })
  assert.equal(parseFrontmatter(readFileSync(created.path, 'utf8'))!.get('owner'), 'codex')
})

test('createItem accepts a status, which is how the board add row works', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Streaming', parent: 'wi-0004', status: 'options',
  })
  assert.equal(parseFrontmatter(readFileSync(created.path, 'utf8'))!.get('status'), 'options')
})

test('createItem writes the template body with Objective first', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })
  const text = readFileSync(created.path, 'utf8')
  assert.ok(text.indexOf('## Objective') < text.indexOf('## Context'))
  assert.ok(text.indexOf('## Context') < text.indexOf('## Acceptance Criteria'))
})

test('the body carries no H1, because Obsidian already draws the filename as the title', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })
  const text = readFileSync(created.path, 'utf8')
  assert.doesNotMatch(text, /^# /m, 'an H1 repeating the title shows the same words twice')
  assert.match(text, /^---\n[\s\S]*?\n---\n\n## Objective\n/, 'Objective is the first thing in the body')
})

test('createItem resolves the parent by id, filename or title', async () => {
  fixture = seed()
  for (const [i, ref] of ['wi-0004', 'Build server', 'build server'].entries()) {
    const created = await createItem(await reload(fixture), { title: `Child ${i}`, parent: ref })
    const fm = parseFrontmatter(readFileSync(created.path, 'utf8'))!
    assert.equal(fm.get('parent'), '[[Build server]]')
  }
})

test('createItem links the parent by filename, not by title', async () => {
  fixture = seed()
  fixture.write('Boards/Auth--b2e1.md', item({
    type: 'work-item', id: 'wi-0014', title: 'Authentication', status: 'backlog',
    parent: '"[[Main]]"', created: '2026-09-22', updated: '2026-09-22',
  }))
  const created = await createItem(await reload(fixture), { title: 'Tokens', parent: 'wi-0014' })
  const fm = parseFrontmatter(readFileSync(created.path, 'utf8'))!
  assert.equal(fm.get('parent'), '[[Auth--b2e1]]', 'the wikilink is authoritative for resolution')
})

test('createItem adds the id suffix when the filename is taken (decision D3)', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Build server', parent: 'wi-0001',
  })
  assert.match(created.relPath, /^Boards\/Build server--[a-z0-9]{4}\.md$/)
  assert.equal(parseFrontmatter(readFileSync(created.path, 'utf8'))!.get('title'), 'Build server')
})

test('createItem mints an id no existing item holds', async () => {
  fixture = seed()
  const ids = new Set<string>()
  for (let i = 0; i < 25; i++) {
    const created = await createItem(await reload(fixture), { title: `Item ${i}`, parent: 'wi-0001' })
    assert.equal(ids.has(created.id), false)
    ids.add(created.id)
  }
  const vault = await reload(fixture)
  assert.deepEqual(vault.duplicateIds, [])
})

test('the new item is a child of its parent on the next load', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })
  const vault = await reload(fixture)
  const children = vault.childrenOf(vault.byId.get('wi-0004')!)
  assert.deepEqual(children.map((i) => i.id), [created.id])
})

test('createItem refuses an unresolvable parent', async () => {
  fixture = seed()
  await assert.rejects(
    createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-nope' }),
    /no work item/i,
  )
})

test('createItem requires a parent, because only the root has none', async () => {
  fixture = seed()
  await assert.rejects(
    createItem(await reload(fixture), { title: 'Streaming', parent: '' }),
    /parent/i,
  )
})

test('createItem refuses an empty title', async () => {
  fixture = seed()
  await assert.rejects(
    createItem(await reload(fixture), { title: '   ', parent: 'wi-0001' }),
    /title/i,
  )
})

test('createItem refuses an invalid status rather than writing a fifth value', async () => {
  fixture = seed()
  await assert.rejects(
    // @ts-expect-error the CLI parses this from argv, so the guard must exist at runtime
    createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0001', status: 'active' }),
    /status/i,
  )
})

test('createItem never overwrites a file that is already there', async () => {
  fixture = seed()
  fixture.write('Boards/Streaming.md', '# a note that is not a work item\n')
  await assert.rejects(
    createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0001' }),
    /exists/i,
  )
  assert.equal(readFileSync(join(fixture.root, 'Boards/Streaming.md'), 'utf8'),
    '# a note that is not a work item\n')
})

test('createItem sanitises a title that is not filename-safe', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Ship v1/v2: the [[hard]] one?', parent: 'wi-0001',
  })
  assert.ok(existsSync(created.path))
  assert.equal(
    parseFrontmatter(readFileSync(created.path, 'utf8'))!.get('title'),
    'Ship v1/v2: the [[hard]] one?',
    'the title keeps the characters the filename had to drop',
  )
})
