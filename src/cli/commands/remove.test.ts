import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { removeItem, TRASH } from './remove.ts'
import { loadVault } from '../vault.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

/** Main > App > Server > Streaming, plus a leaf on Main. */
function tree(): Fixture {
  const f = makeVault()
  const w = (id: string, stem: string, parent?: string) =>
    f.write(`Boards/${stem}.md`, item({
      type: 'work-item', id, title: stem,
      ...(parent ? { status: 'backlog', parent: `"[[${parent}]]"` } : {}),
      created: '2026-09-21', updated: '2026-09-21',
    }, `Body of ${stem}.\n`))
  w('wi-0001', 'Main')
  w('wi-0002', 'App', 'Main')
  w('wi-0003', 'Server', 'App')
  w('wi-0004', 'Streaming', 'Server')
  w('wi-0005', 'Leaf', 'Main')
  return f
}

const gone = (f: Fixture, stem: string) => !existsSync(join(f.root, `Boards/${stem}.md`))

test('removeItem trashes a leaf', async () => {
  fixture = tree()
  const result = await removeItem(await loadVault(fixture.root), 'wi-0005')
  assert.equal(result.removed.length, 1)
  assert.equal(result.removed[0]!.item.id, 'wi-0005')
  assert.ok(gone(fixture, 'Leaf'))
})

test('a removed file goes to the trash, not to nowhere', async () => {
  fixture = tree()
  const result = await removeItem(await loadVault(fixture.root), 'wi-0005')
  const trashed = join(fixture.root, result.removed[0]!.trashedTo)
  assert.ok(existsSync(trashed), result.removed[0]!.trashedTo)
  assert.match(readFileSync(trashed, 'utf8'), /Body of Leaf\./)
  assert.ok(result.removed[0]!.trashedTo.startsWith(`${TRASH}/`))
})

test('removeItem refuses an item with children, and names them', async () => {
  fixture = tree()
  const vault = await loadVault(fixture.root)
  await assert.rejects(removeItem(vault, 'wi-0003'), /Streaming/)
  await assert.rejects(removeItem(vault, 'wi-0003'), /--recursive/)
  assert.ok(!gone(fixture, 'Server'), 'nothing was removed')
})

test('--recursive removes the whole subtree', async () => {
  fixture = tree()
  const result = await removeItem(await loadVault(fixture.root), 'wi-0002', { recursive: true })
  assert.deepEqual(
    result.removed.map((r) => r.item.id).sort(),
    ['wi-0002', 'wi-0003', 'wi-0004'],
  )
  for (const stem of ['App', 'Server', 'Streaming']) assert.ok(gone(fixture, stem), stem)
})

test('--recursive removes descendants before their parents', async () => {
  fixture = tree()
  const result = await removeItem(await loadVault(fixture.root), 'wi-0002', { recursive: true })
  assert.deepEqual(result.removed.map((r) => r.item.id), ['wi-0004', 'wi-0003', 'wi-0002'])
})

test('--recursive leaves the rest of the vault alone', async () => {
  fixture = tree()
  await removeItem(await loadVault(fixture.root), 'wi-0002', { recursive: true })
  assert.ok(!gone(fixture, 'Main'))
  assert.ok(!gone(fixture, 'Leaf'))
})

test('removing a subtree orphans nothing', async () => {
  fixture = tree()
  await removeItem(await loadVault(fixture.root), 'wi-0002', { recursive: true })
  const vault = await loadVault(fixture.root)
  for (const meta of vault.items) {
    if (meta.parent === null) continue
    assert.ok(vault.resolveLink(meta.parent), `${meta.relPath} was orphaned`)
  }
})

test('--dry-run reports what would go and removes nothing', async () => {
  fixture = tree()
  const result = await removeItem(await loadVault(fixture.root), 'wi-0002', {
    recursive: true, dryRun: true,
  })
  assert.equal(result.dryRun, true)
  assert.equal(result.removed.length, 3)
  for (const stem of ['App', 'Server', 'Streaming']) assert.ok(!gone(fixture, stem), stem)
})

test('removeItem refuses the root, which is not a card anyone can discard', async () => {
  fixture = tree()
  const vault = await loadVault(fixture.root)
  await assert.rejects(removeItem(vault, 'wi-0001', { recursive: true }), /root/i)
  assert.ok(!gone(fixture, 'Main'))
})

test('removeItem refuses an unknown reference', async () => {
  fixture = tree()
  const vault = await loadVault(fixture.root)
  await assert.rejects(removeItem(vault, 'wi-nope'), /no work item/i)
})

test('a name already in the trash does not overwrite what is there', async () => {
  fixture = tree()
  fixture.write('.trash/Leaf.md', 'an older Leaf\n')
  const result = await removeItem(await loadVault(fixture.root), 'wi-0005')
  assert.notEqual(result.removed[0]!.trashedTo, '.trash/Leaf.md')
  assert.equal(readFileSync(join(fixture.root, '.trash/Leaf.md'), 'utf8'), 'an older Leaf\n')
})

test('the trash is never indexed, so a removed item leaves no trace on a board', async () => {
  fixture = tree()
  await removeItem(await loadVault(fixture.root), 'wi-0005')
  const vault = await loadVault(fixture.root)
  assert.equal(vault.items.length, 4)
  assert.deepEqual(vault.misplaced, [])
  assert.equal(vault.byId.has('wi-0005'), false)
})

test('removing an orphan works, since it is on no board to begin with', async () => {
  fixture = tree()
  fixture.write('Boards/Orphan.md', item({
    type: 'work-item', id: 'wi-0009', title: 'Orphan', status: 'doing',
    parent: '"[[Nowhere]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const result = await removeItem(await loadVault(fixture.root), 'wi-0009')
  assert.equal(result.removed.length, 1)
  assert.ok(gone(fixture, 'Orphan'))
})

test('removeItem refuses while a work-item folder file is unaccounted for', async () => {
  const f = makeVault()
  try {
    f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-09-21', updated: '2026-09-21' }))
    f.write('Boards/Parent.md', item({ type: 'work-item', id: 'wi-0002', title: 'Parent', status: 'backlog', parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21' }))
    // A sync stub for an evicted child of Parent. Its frontmatter cannot be read.
    f.write('Boards/.Child.md.icloud', 'bplist00')
    const vault = await loadVault(f.root)
    await assert.rejects(removeItem(vault, 'wi-0002'), /not accounted for/i)
    assert.ok(existsSync(`${f.root}/Boards/Parent.md`))
  } finally {
    f.cleanup()
  }
})
