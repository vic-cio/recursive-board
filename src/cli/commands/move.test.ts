import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { moveItem } from './move.ts'
import { loadVault } from '../vault.ts'
import { parseFrontmatter } from '../../shared/frontmatter.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

// Main > App > Server, and Main > Site.
function seed(): Fixture {
  const f = makeVault()
  const at = { created: '2026-09-21', updated: '2026-09-21' }
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', ...at }))
  f.write('Boards/App.md', item({
    type: 'work-item', id: 'wi-0002', title: 'App', status: 'doing', parent: '"[[Main]]"', ...at,
  }))
  f.write('Boards/Server.md', item({
    type: 'work-item', id: 'wi-0003', title: 'Server', status: 'done', prev_status: 'doing',
    parent: '"[[App]]"', mystery_key: 'keep me', ...at,
  }, '# Server\n\nHuman prose.\n'))
  f.write('Boards/Site.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Site', status: 'backlog', parent: '"[[Main]]"', ...at,
  }))
  return f
}

const read = (f: Fixture, name: string) => readFileSync(`${f.root}/Boards/${name}.md`, 'utf8')
const fm = (f: Fixture, name: string) => parseFrontmatter(read(f, name))!

test('moveItem rewrites parent to the target wikilink', async () => {
  fixture = seed()
  const result = await moveItem(await loadVault(fixture.root), 'wi-0003', 'Site')
  assert.equal(result.changed, true)
  assert.equal(result.from, 'App')
  assert.equal(result.to.stem, 'Site')
  assert.equal(fm(fixture, 'Server').get('parent'), '[[Site]]')
})

test('moveItem keeps status and prev_status', async () => {
  fixture = seed()
  await moveItem(await loadVault(fixture.root), 'wi-0003', 'wi-0004')
  assert.equal(fm(fixture, 'Server').get('status'), 'done')
  assert.equal(fm(fixture, 'Server').get('prev_status'), 'doing')
})

test('moveItem is a two-line diff: parent and updated, every other byte copied', async () => {
  fixture = seed()
  const before = read(fixture, 'Server').split('\n')
  await moveItem(await loadVault(fixture.root), 'wi-0003', 'Site')
  const after = read(fixture, 'Server').split('\n')
  assert.equal(after.length, before.length)
  const changed = after.filter((line, i) => line !== before[i])
  assert.deepEqual(changed.map((l) => l.split(':')[0]), ['parent', 'updated'])
})

test('moveItem writes only the moved file, never the old or new parent', async () => {
  fixture = seed()
  const app = read(fixture, 'App')
  const site = read(fixture, 'Site')
  await moveItem(await loadVault(fixture.root), 'wi-0003', 'Site')
  assert.equal(read(fixture, 'App'), app)
  assert.equal(read(fixture, 'Site'), site)
})

test('moveItem onto the current parent writes nothing', async () => {
  fixture = seed()
  const before = read(fixture, 'Server')
  const result = await moveItem(await loadVault(fixture.root), 'wi-0003', 'App')
  assert.equal(result.changed, false)
  assert.equal(read(fixture, 'Server'), before)
})

test('moveItem refuses to move the root', async () => {
  fixture = seed()
  await assert.rejects(moveItem(await loadVault(fixture.root), 'Main', 'Site'), /root/i)
})

test('moveItem refuses a move under the item\'s own descendant', async () => {
  fixture = seed()
  await assert.rejects(moveItem(await loadVault(fixture.root), 'App', 'Server'), /loop/i)
})

test('moveItem repairs an orphan by giving it a parent that resolves', async () => {
  fixture = seed()
  fixture.write('Boards/Lost.md', item({
    type: 'work-item', id: 'wi-0009', title: 'Lost', status: 'backlog', parent: '"[[Gone]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  await moveItem(await loadVault(fixture.root), 'wi-0009', 'Main')
  assert.equal(fm(fixture, 'Lost').get('parent'), '[[Main]]')
})

test('moveItem refuses while any file is evicted, because a loop could run through it', async () => {
  fixture = seed()
  fixture.write('Boards/.Hidden.md.icloud', 'bplist00')
  await assert.rejects(moveItem(await loadVault(fixture.root), 'wi-0003', 'Site'), /evicted/i)
})
