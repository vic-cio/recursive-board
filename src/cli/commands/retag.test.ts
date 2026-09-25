import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { retag, staleAreaTags, writeGraphColours } from './retag.ts'
import { createItem } from './new.ts'
import { validate } from './validate.ts'
import { loadVault } from '../vault.ts'
import { getList } from '../../shared/frontmatter.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

const dates = { created: '2026-09-21', updated: '2026-09-21' }

function seed(areaTags = true): Fixture {
  const f = makeVault()
  f.write('.wi.json', JSON.stringify({ areaTags }))
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', board: true, ...dates }))
  f.write('Boards/Work.md', item({ type: 'work-item', id: 'wi-0002', title: 'Work', status: 'doing', area: true, parent: '"[[Main]]"', ...dates }))
  f.write('Boards/Web Site.md', item({ type: 'work-item', id: 'wi-0003', title: 'Web Site', status: 'doing', area: true, parent: '"[[Work]]"', ...dates }))
  f.write('Boards/Fix nav.md', item({ type: 'work-item', id: 'wi-0004', title: 'Fix nav', status: 'backlog', parent: '"[[Web Site]]"', ...dates },
    '## Notes\n'))
  f.write('Boards/Loose.md', `---\ntype: work-item\nid: wi-0005\ntitle: Loose\nstatus: backlog\nparent: "[[Main]]"\ntags:\n  - design\n  - area/old\ncreated: 2026-09-21\nupdated: 2026-09-21\n---\n`)
  return f
}

const tags = (f: Fixture, name: string) => getList(readFileSync(join(f.root, 'Boards', `${name}.md`), 'utf8'), 'tags')

test('retag gives each item the tag of its areas and strips stale ones', async () => {
  fixture = seed()
  const planned = await retag(await loadVault(fixture.root), true)
  assert.deepEqual(planned.map((s) => s.item.id).sort(), ['wi-0002', 'wi-0003', 'wi-0004', 'wi-0005'])
  assert.equal(tags(fixture, 'Fix nav'), undefined, 'a dry run writes nothing')

  await retag(await loadVault(fixture.root), false)
  assert.deepEqual(tags(fixture, 'Work'), ['area/work'])
  assert.deepEqual(tags(fixture, 'Web Site'), ['area/work/web-site'])
  assert.deepEqual(tags(fixture, 'Fix nav'), ['area/work/web-site'])
  assert.deepEqual(tags(fixture, 'Loose'), ['design'])
  assert.equal(tags(fixture, 'Main'), undefined, 'a root takes no area tag')
  assert.deepEqual(staleAreaTags(await loadVault(fixture.root)), [])
})

test('validate warns on a stale area tag only when area tags are on', async () => {
  fixture = seed()
  const on = await validate(await loadVault(fixture.root))
  assert.ok(on.problems.some((p) => p.rule === 'area-tag-stale' && /area\/work\/web-site/.test(p.message)))
  fixture.write('.wi.json', '{}')
  const off = await validate(await loadVault(fixture.root))
  assert.equal(off.problems.some((p) => p.rule === 'area-tag-stale'), false)
})

test('wi new writes the area tag, for a card and for a new area', async () => {
  fixture = seed()
  const card = await createItem(await loadVault(fixture.root), { title: 'Add search', parent: 'Web Site' })
  assert.deepEqual(getList(readFileSync(card.path, 'utf8'), 'tags'), ['area/work/web-site'])
  const area = await createItem(await loadVault(fixture.root), { title: 'Blog', parent: 'Work', template: 'area' })
  assert.deepEqual(getList(readFileSync(area.path, 'utf8'), 'tags'), ['area/work/blog'])
  const top = await createItem(await loadVault(fixture.root), { title: 'Errand', parent: 'Main' })
  assert.equal(getList(readFileSync(top.path, 'utf8'), 'tags'), undefined)
})

test('wi new writes no tag and retag refuses while area tags are off', async () => {
  fixture = seed(false)
  const card = await createItem(await loadVault(fixture.root), { title: 'Add search', parent: 'Web Site' })
  assert.equal(getList(readFileSync(card.path, 'utf8'), 'tags'), undefined)
  await assert.rejects(retag(await loadVault(fixture.root), false), /areaTags/)
})

test('writeGraphColours replaces its own groups and keeps the owner groups and settings', async () => {
  fixture = seed()
  mkdirSync(join(fixture.root, '.obsidian'))
  const graph = join(fixture.root, '.obsidian', 'graph.json')
  writeFileSync(graph, JSON.stringify({
    scale: 0.9,
    colorGroups: [{ query: 'tag:#area/gone', color: { a: 1, rgb: 1 } }, { query: 'path:Knowledge', color: { a: 1, rgb: 2 } }],
  }))
  const written = await writeGraphColours(await loadVault(fixture.root))
  assert.deepEqual(written, { path: '.obsidian/graph.json', groups: 4, kept: 1 })
  const after = JSON.parse(readFileSync(graph, 'utf8'))
  assert.equal(after.scale, 0.9)
  assert.deepEqual(after.colorGroups.map((g: { query: string }) => g.query), [
    'tag:#area/work/web-site ([board:true] OR [area:true])', 'tag:#area/work/web-site',
    'tag:#area/work ([board:true] OR [area:true])', 'tag:#area/work',
    'path:Knowledge',
  ])
})
