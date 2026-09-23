import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { generate, writeFixture } from './fixture.ts'
import { loadVault } from '../src/cli/vault.ts'
import { validate } from '../src/cli/commands/validate.ts'
import { parseFrontmatter } from '../src/shared/frontmatter.ts'
import { toColumns } from '../src/plugin/index.ts'
import { makeVault, type Fixture } from '../src/cli/test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

async function generated() {
  fixture = makeVault()
  await writeFixture(fixture.root)
  return loadVault(fixture.root)
}

test('the fixture validates to exactly its two deliberate problems', async () => {
  const report = await validate(await generated())
  assert.deepEqual(
    report.problems.map((p) => `${p.severity} ${p.rule} ${p.relPath}`).sort(),
    [
      'error parent-unresolved Boards/Orphaned research spike.md',
      'warning unknown-key Boards/Improve knowledge system.md',
    ],
  )
})

test('the duplicate title takes the D3 collision suffix, and its child link resolves', async () => {
  const vault = await generated()
  const second = vault.resolve('wi-b2e1')
  assert.equal(second.stem, 'Authentication--b2e1')
  assert.equal(vault.resolveLink(second.parent)?.stem, 'Marketing site')
})

test('the Done window has an item inside it and one outside, whatever today is', async () => {
  const vault = await generated()
  const app = vault.resolve('Ship the mobile app')
  const kids = vault.childrenOf(app).map((i) => ({
    status: i.status,
    updated: String(i.frontmatter.get('updated')),
  }))
  const done = toColumns(kids as never).find((c) => c.status === 'done')!
  assert.ok(done.visible.length > 0)
  assert.ok(done.hidden > 0)
})

test('the unknown key survives generation as written', async () => {
  await generated()
  const text = readFileSync(`${fixture!.root}/Boards/Improve knowledge system.md`, 'utf8')
  assert.equal(parseFrontmatter(text)!.get('trello_card'), 'sample-card')
})

test('generation is deterministic for a given day', () => {
  const day = new Date(2026, 8, 22)
  assert.deepEqual([...generate(day)], [...generate(day)])
})

test('the fixture refuses to write into iCloud', async () => {
  await assert.rejects(writeFixture('/Users/x/Library/Documents/vault'), /iCloud/)
})
