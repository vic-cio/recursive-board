import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'

import { setTag } from './tag.ts'
import { loadVault } from '../vault.ts'
import { getList, parseFrontmatter } from '../../shared/frontmatter.ts'
import { today } from '../../shared/schema.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(tags = ''): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-09-21', updated: '2026-09-21' }))
  f.write('Boards/Task.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Task', status: 'todo', parent: '"[[Main]]"',
    created: '2026-09-21', updated: '2026-09-21', ...(tags === '' ? {} : { tags }),
  }, '# Task\n'))
  return f
}

const path = (f: Fixture) => `${f.root}/Boards/Task.md`
const tagsOf = (f: Fixture) => getList(readFileSync(path(f), 'utf8'), 'tags')

test('setTag adds a free tag after the area tag and stamps updated', async () => {
  fixture = seed('\n  - area/work')
  const change = await setTag(await loadVault(fixture.root), 'wi-0002', '#design', true)
  assert.deepEqual(change, { item: change.item, tag: 'design', added: true, changed: true })
  assert.deepEqual(tagsOf(fixture), ['area/work', 'design'])
  assert.equal(parseFrontmatter(readFileSync(path(fixture), 'utf8'))!.get('updated'), today())
})

test('setTag removes a free tag in any case and keeps the area tag', async () => {
  fixture = seed('\n  - Design\n  - area/work')
  const change = await setTag(await loadVault(fixture.root), 'Task', 'design', false)
  assert.equal(change.changed, true)
  assert.deepEqual(tagsOf(fixture), ['area/work'])
})

test('setTag writes nothing when the card already agrees', async () => {
  fixture = seed('\n  - design')
  const before = readFileSync(path(fixture), 'utf8')
  const vault = await loadVault(fixture.root)
  assert.equal((await setTag(vault, 'Task', 'design', true)).changed, false)
  assert.equal((await setTag(vault, 'Task', 'web', false)).changed, false)
  assert.equal(readFileSync(path(fixture), 'utf8'), before)
})

test('setTag refuses an area tag and writes nothing', async () => {
  fixture = seed('\n  - area/work')
  const before = readFileSync(path(fixture), 'utf8')
  const vault = await loadVault(fixture.root)
  await assert.rejects(setTag(vault, 'Task', 'area/home', true), /reserved for old area tags/)
  await assert.rejects(setTag(vault, 'Task', 'area/work', false), /reserved for old area tags/)
  assert.equal(readFileSync(path(fixture), 'utf8'), before)
})

test('setTag reads the tags in the file at write time, so a tag added since the load stays', async () => {
  fixture = seed('\n  - design')
  const vault = await loadVault(fixture.root)
  writeFileSync(path(fixture), readFileSync(path(fixture), 'utf8').replace('  - design', '  - design\n  - web'))
  await setTag(vault, 'Task', 'ui', true)
  assert.deepEqual(tagsOf(fixture), ['design', 'web', 'ui'])
})
