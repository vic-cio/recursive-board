import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { setPromoted } from './promote.ts'
import { loadVault } from '../vault.ts'
import { parseFrontmatter } from '../../shared/frontmatter.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => { fixture?.cleanup(); fixture = undefined })

function seed(board?: boolean): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  f.write('Boards/Plan.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Plan', status: 'doing',
    parent: '"[[Main]]"', owner: 'human', mystery_key: 'keep me',
    ...(board === undefined ? {} : { board }),
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Plan\n\nKeep this body.\n'))
  return f
}

const content = (f: Fixture) => readFileSync(join(f.root, 'Boards/Plan.md'), 'utf8')
const frontmatter = (f: Fixture) => parseFrontmatter(content(f))!

test('promote sets board and stamps updated while preserving other keys and body', async () => {
  fixture = seed()
  const result = await setPromoted(await loadVault(fixture.root), 'Plan', true)
  assert.equal(result.promoted, true)
  assert.equal(result.changed, true)
  assert.equal(frontmatter(fixture).get('board'), true)
  assert.notEqual(frontmatter(fixture).get('updated'), '2026-09-21')
  assert.equal(frontmatter(fixture).get('owner'), 'human')
  assert.equal(frontmatter(fixture).get('mystery_key'), 'keep me')
  assert.ok(content(fixture).endsWith('# Plan\n\nKeep this body.\n'))
})

test('promote is idempotent and does not rewrite an already promoted item', async () => {
  fixture = seed(true)
  const before = content(fixture)
  const result = await setPromoted(await loadVault(fixture.root), 'Plan', true)
  assert.equal(result.changed, false)
  assert.equal(content(fixture), before)
})

test('demote removes board and stamps updated while preserving other keys and body', async () => {
  fixture = seed(true)
  const result = await setPromoted(await loadVault(fixture.root), 'Plan', false)
  assert.equal(result.promoted, false)
  assert.equal(result.changed, true)
  assert.equal(frontmatter(fixture).has('board'), false)
  assert.notEqual(frontmatter(fixture).get('updated'), '2026-09-21')
  assert.equal(frontmatter(fixture).get('owner'), 'human')
  assert.equal(frontmatter(fixture).get('mystery_key'), 'keep me')
  assert.ok(content(fixture).endsWith('# Plan\n\nKeep this body.\n'))
})

test('demote is idempotent and does not rewrite an item without board', async () => {
  fixture = seed()
  const before = content(fixture)
  const result = await setPromoted(await loadVault(fixture.root), 'Plan', false)
  assert.equal(result.changed, false)
  assert.equal(content(fixture), before)
})
