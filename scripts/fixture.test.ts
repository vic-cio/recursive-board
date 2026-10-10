import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { generate, generateReview, main, writeFixture, writeReview } from './fixture.ts'
import { loadVault } from '../src/cli/vault.ts'
import { validate } from '../src/shared/commands/validate.ts'
import { getList, parseFrontmatter } from '../src/shared/frontmatter.ts'
import { holdersIn } from '../src/shared/holder.ts'
import { dependenciesOf } from '../src/shared/item-dependencies.ts'
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

test('the duplicate title takes the id collision suffix, and its child link resolves', async () => {
  const vault = await generated()
  const second = vault.resolve('wi-b2e1')
  assert.equal(second.stem, 'Authentication--b2e1')
  assert.equal(vault.resolveLink(second.parent)?.stem, 'Marketing site')
})

test('the generated fixture contains a valid area', async () => {
  const vault = await generated()
  const area = vault.resolve('wi-0021')
  assert.equal(area.area, true)
  assert.equal(area.status, 'backlog')
  assert.equal(area.parent, 'Main')
})

test('the fixture has live areas at two depths, for the root area chips', async () => {
  const vault = await generated()
  const home = vault.resolve('wi-0022')
  const content = vault.resolve('wi-0024')
  assert.deepEqual([home.area, home.status, home.parent], [true, 'doing', 'Main'])
  assert.deepEqual([content.area, content.status, content.parent], [true, 'options', 'Marketing site'])
  assert.equal(vault.resolveLink(content.parent)?.parent, 'Main')
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

test('the fixture refuses a vault that holds a work item it did not generate', async () => {
  fixture = makeVault()
  const boards = join(fixture.root, 'Boards')
  mkdirSync(boards, { recursive: true })
  writeFileSync(join(boards, 'Real card.md'), '---\ntype: work-item\nid: wi-real\ntitle: Real card\n---\n')
  await assert.rejects(writeFixture(fixture.root), /wi-real/)
  assert.ok(existsSync(join(boards, 'Real card.md')))
})

test('the fixture regenerates over its own earlier output', async () => {
  fixture = makeVault()
  await writeFixture(fixture.root)
  assert.equal(await writeFixture(fixture.root), generate().size)
})

// The review set: the clean vault that a person checks the board UI against.

const DAY = new Date(2026, 9, 10)

/** A vault Obsidian could have opened, which the review mode requires. */
function obsidianVault(): Fixture {
  fixture = makeVault()
  mkdirSync(join(fixture.root, '.obsidian'))
  return fixture
}

async function reviewed() {
  const { root } = obsidianVault()
  await writeReview(root, DAY)
  return loadVault(root)
}

test('the review set validates with no error and no warning', async () => {
  const report = await validate(await reviewed())
  assert.deepEqual(report.problems, [])
  assert.equal(report.itemCount, 25)
})

test('the review set has a root board owned by Victor, and the two people', async () => {
  const vault = await reviewed()
  const board = vault.resolve('wi-test')
  assert.deepEqual([board.stem, board.parent, board.board, board.frontmatter.get('owner')], ['Test board', null, true, 'Victor'])
  for (const name of ['Victor', 'Sam']) {
    assert.equal(parseFrontmatter(readFileSync(join(fixture!.root, 'People', `${name}.md`), 'utf8'))!.get('type'), 'person')
  }
})

test('the review set has every kind of card the board UI needs checked', async () => {
  const vault = await reviewed()
  const cards = vault.items.filter((i) => i.parent !== null)
  const waits = cards.map((i) => ({ title: i.title, ...dependenciesOf(vault, i) }))
  const holders = cards.map((i) => ({ title: i.title, holders: holdersIn(i.text) }))
  assert.ok(holders.some((h) => h.holders.length === 2), 'a card with two holders')
  assert.ok(holders.some((h) => h.holders.length === 1 && h.holders[0] === 'agent'), 'a card for any agent')
  assert.ok(holders.some((h) => h.holders.length === 1 && h.holders[0] === 'claude'), 'a card with one holder')
  assert.ok(waits.some((w) => w.people.length > 0 && w.resolved.length === 0), 'a card that waits on a person')
  assert.ok(waits.some((w) => w.resolved.length > 0 && w.people.length === 0), 'a card that waits on a card')
  assert.ok(waits.some((w) => w.resolved.length > 0 && w.people.length > 0), 'a card that waits on both')
  const area = cards.find((i) => i.area)!
  assert.ok(vault.childrenOf(area).length >= 2, 'an area with children')
  assert.ok(cards.filter((i) => i.status === 'done').length >= 2, 'done cards')
  assert.ok(cards.some((i) => (getList(i.text, 'tags') ?? []).length >= 5), 'a card with several labels')
  assert.ok(cards.some((i) => (i.title ?? '').length > 100), 'a long title')
  assert.ok(cards.some((i) => i.frontmatter.get('priority') !== undefined), 'a priority')
  assert.ok(cards.some((i) => i.frontmatter.get('owner') !== undefined), 'an owner')
  assert.ok(cards.some((i) => vault.childrenOf(i).length > 0 && !i.area), 'a card with children')
})

test('the review set takes its dates from the day it is given', () => {
  const files = generateReview(DAY)
  assert.deepEqual([...files], [...generateReview(DAY)])
  assert.match(files.get('Boards/Test board.md')!, /created: 2026-10-10\n/)
  assert.notEqual(files.get('Boards/Test board.md'), generateReview(new Date(2026, 9, 11)).get('Boards/Test board.md'))
})

test('the review mode refuses a path with no .obsidian folder, and writes nothing', async () => {
  fixture = makeVault()
  await assert.rejects(writeReview(fixture.root, DAY), /\.obsidian/)
  assert.equal(existsSync(join(fixture.root, 'People')), false)
  assert.deepEqual(readdirSync(join(fixture.root, 'Boards')), [])
})

test('the review mode regenerates over its own earlier output', async () => {
  const { root } = obsidianVault()
  const first = await writeReview(root, DAY)
  assert.equal(await writeReview(root, DAY), first)
  assert.equal(readdirSync(join(root, 'Boards')).length, 25)
})

test('the review mode replaces the cards under its own board, whatever their ids', async () => {
  const { root, write } = obsidianVault()
  await writeReview(root, DAY)
  write('Boards/Old seed card.md', '---\ntype: work-item\nid: wi-a7f3\ntitle: Old seed card\nstatus: backlog\nparent: "[[Chips- none]]"\n---\n')
  await writeReview(root, DAY)
  assert.equal(existsSync(join(root, 'Boards', 'Old seed card.md')), false)
  assert.equal(readdirSync(join(root, 'Boards')).length, 25)
})

test('the review mode refuses a vault with a card it did not write, and deletes nothing', async () => {
  const { root, write } = obsidianVault()
  await writeReview(root, DAY)
  write('Boards/Real card.md', '---\ntype: work-item\nid: wi-real\ntitle: Real card\n---\n')
  const before = readdirSync(join(root, 'Boards')).sort()
  await assert.rejects(writeReview(root, DAY), /wi-real/)
  assert.deepEqual(readdirSync(join(root, 'Boards')).sort(), before)
})

test('the review mode refuses a file in Boards that is not a work item', async () => {
  const { root, write } = obsidianVault()
  write('Boards/Notes.md', 'A note with no frontmatter.\n')
  await assert.rejects(writeReview(root, DAY), /Notes\.md/)
  assert.equal(existsSync(join(root, 'Boards', 'Notes.md')), true)
})

test('the review mode refuses a person note it did not write', async () => {
  const { root, write } = obsidianVault()
  write('People/Victor.md', '---\ntype: person\ndescription: "The real Victor."\n---\n')
  await assert.rejects(writeReview(root, DAY), /People\/Victor\.md/)
  assert.match(readFileSync(join(root, 'People', 'Victor.md'), 'utf8'), /The real Victor/)
  assert.deepEqual(readdirSync(join(root, 'Boards')), [])
})

test('the review mode leaves other people notes alone', async () => {
  const { root, write } = obsidianVault()
  write('People/Ana.md', '---\ntype: person\n---\n')
  await writeReview(root, DAY)
  assert.equal(existsSync(join(root, 'People', 'Ana.md')), true)
})

test('the dev fixture still refuses the review set, which it did not write', async () => {
  const { root } = obsidianVault()
  await writeReview(root, DAY)
  await assert.rejects(writeFixture(root), /refusing to replace work item with id wi-/)
})

test('the command line needs --vault for --review, and never defaults it to test/', async () => {
  await assert.rejects(main(['--review']), /--vault/)
  await assert.rejects(main(['--review', '--vault']), /--vault/)
})

test('the command line writes the review set into the given vault', async () => {
  const { root } = obsidianVault()
  assert.match(await main(['--review', '--vault', root]), /wrote 25 review work items/)
  assert.equal((await validate(await loadVault(root))).problems.length, 0)
})
