import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'

import { loadVault, findVaultRoot } from './vault.ts'
import { makeVault, item, type Fixture } from './test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function vaultWithTree(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-22',
  }, '# Main\n'))
  f.write('Boards/Build server.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Build server', status: 'doing',
    parent: '"[[Main]]"', owner: 'sam',
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Build server\n'))
  f.write('Boards/Streaming.md', item({
    type: 'work-item', id: 'wi-0005', title: 'Streaming', status: 'backlog',
    parent: '"[[Build server]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Streaming\n'))
  f.write('Boards/Sessions.md', item({
    type: 'work-item', id: 'wi-0006', title: 'Session management', status: 'done',
    parent: '"[[Build server]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Session management\n'))
  return f
}

test('loadVault reads every work item in Boards', async () => {
  fixture = vaultWithTree()
  const vault = await loadVault(fixture.root)
  assert.equal(vault.items.length, 4)
  assert.deepEqual(vault.items.map((i) => i.id).sort(), ['wi-0001', 'wi-0004', 'wi-0005', 'wi-0006'])
})

test('loadVault records the filename stem, which is what a wikilink resolves to', async () => {
  fixture = vaultWithTree()
  const vault = await loadVault(fixture.root)
  const sessions = vault.byId.get('wi-0006')!
  assert.equal(sessions.stem, 'Sessions')
  assert.equal(sessions.title, 'Session management')
})

test('loadVault reads the parent as a resolved wikilink target', async () => {
  fixture = vaultWithTree()
  const vault = await loadVault(fixture.root)
  assert.equal(vault.byId.get('wi-0004')!.parent, 'Main')
  assert.equal(vault.byId.get('wi-0001')!.parent, null, 'a root has no parent')
})

test('loadVault ignores Knowledge, Intake, Templates and Attachments', async () => {
  fixture = vaultWithTree()
  fixture.write('Knowledge/App Protocol.md', '---\ntype: knowledge\n---\n\n# App\n')
  fixture.write('Intake/scratch.md', 'raw thoughts, no frontmatter\n')
  fixture.write('Templates/work-item.md', item({ type: 'work-item', id: 'wi-XXXX', title: '' }))
  const vault = await loadVault(fixture.root)
  assert.equal(vault.items.length, 4)
})

test('loadVault ignores a file in Boards that is not a work item', async () => {
  fixture = vaultWithTree()
  fixture.write('Boards/notes.md', '# Just a note, no frontmatter\n')
  fixture.write('Boards/other.md', '---\ntype: knowledge\n---\n\n# Other\n')
  const vault = await loadVault(fixture.root)
  assert.equal(vault.items.length, 4)
})

test('childrenOf returns the items whose parent wikilink resolves here', async () => {
  fixture = vaultWithTree()
  const vault = await loadVault(fixture.root)
  const server = vault.byId.get('wi-0004')!
  assert.deepEqual(vault.childrenOf(server).map((i) => i.id).sort(), ['wi-0005', 'wi-0006'])
  assert.deepEqual(vault.childrenOf(vault.byId.get('wi-0005')!), [])
})

test('childrenOf resolves a wikilink case-insensitively, as Obsidian does', async () => {
  fixture = vaultWithTree()
  fixture.write('Boards/Lowercase link.md', item({
    type: 'work-item', id: 'wi-0009', title: 'Lowercase link', status: 'backlog',
    parent: '"[[build server]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const vault = await loadVault(fixture.root)
  const ids = vault.childrenOf(vault.byId.get('wi-0004')!).map((i) => i.id)
  assert.ok(ids.includes('wi-0009'))
})

test('childrenOf resolves a wikilink that carries a folder path', async () => {
  fixture = vaultWithTree()
  fixture.write('Boards/Pathed.md', item({
    type: 'work-item', id: 'wi-0010', title: 'Pathed', status: 'backlog',
    parent: '"[[Boards/Build server]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const vault = await loadVault(fixture.root)
  const ids = vault.childrenOf(vault.byId.get('wi-0004')!).map((i) => i.id)
  assert.ok(ids.includes('wi-0010'))
})

test('an orphan keeps its unresolved parent target and appears as nobody child', async () => {
  fixture = vaultWithTree()
  fixture.write('Boards/Orphaned research spike.md', item({
    type: 'work-item', id: 'wi-0016', title: 'Orphaned research spike', status: 'doing',
    parent: '"[[Build app prototype]]"', created: '2026-08-02', updated: '2026-08-09',
  }))
  const vault = await loadVault(fixture.root)
  const orphan = vault.byId.get('wi-0016')!
  assert.equal(orphan.parent, 'Build app prototype')
  assert.equal(vault.resolveLink(orphan.parent), undefined)
  for (const i of vault.items) assert.ok(!vault.childrenOf(i).includes(orphan))
})

test('resolve finds an item by id', async () => {
  fixture = vaultWithTree()
  const vault = await loadVault(fixture.root)
  assert.equal(vault.resolve('wi-0004').id, 'wi-0004')
})

test('resolve finds an item by filename stem', async () => {
  fixture = vaultWithTree()
  const vault = await loadVault(fixture.root)
  assert.equal(vault.resolve('Build server').id, 'wi-0004')
  assert.equal(vault.resolve('build server').id, 'wi-0004')
})

test('resolve finds an item by title when no filename matches', async () => {
  fixture = vaultWithTree()
  const vault = await loadVault(fixture.root)
  assert.equal(vault.resolve('Session management').id, 'wi-0006')
})

test('resolve throws with a useful message when nothing matches', async () => {
  fixture = vaultWithTree()
  const vault = await loadVault(fixture.root)
  assert.throws(() => vault.resolve('wi-nope'), /no work item/i)
})

test('resolve refuses an ambiguous title rather than guessing', async () => {
  fixture = vaultWithTree()
  fixture.write('Boards/Streaming--aaaa.md', item({
    type: 'work-item', id: 'wi-0020', title: 'Streaming', status: 'backlog',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const vault = await loadVault(fixture.root)
  assert.equal(vault.resolve('Streaming--aaaa').id, 'wi-0020', 'a unique stem still resolves')
  assert.equal(vault.resolve('Streaming').id, 'wi-0005', 'a filename match beats a title match')
})

test('loadVault reports a duplicate id rather than dropping one of the items', async () => {
  fixture = vaultWithTree()
  fixture.write('Boards/Twin.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Twin', status: 'backlog',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const vault = await loadVault(fixture.root)
  assert.equal(vault.items.length, 5)
  assert.deepEqual(vault.duplicateIds, ['wi-0004'])
})

test('loadVault records an iCloud placeholder instead of seeing the file as absent', async () => {
  fixture = vaultWithTree()
  fixture.write('Boards/.Evicted card.md.icloud', '')
  const vault = await loadVault(fixture.root)
  assert.deepEqual(vault.evicted, ['Boards/Evicted card.md'])
  assert.equal(vault.items.length, 4, 'an evicted file is not a work item, and is not invented')
})

test('loadVault records a Markdown file nested below one of the five folders', async () => {
  fixture = vaultWithTree()
  fixture.write('Boards/Project/Nested.md', item({
    type: 'work-item', id: 'wi-0030', title: 'Nested', status: 'backlog', parent: '"[[Main]]"',
  }))
  const vault = await loadVault(fixture.root)
  assert.deepEqual(vault.misplaced, ['Boards/Project/Nested.md'])
})

test('loadVault takes the takenIds and takenStems a new item must avoid', async () => {
  fixture = vaultWithTree()
  const vault = await loadVault(fixture.root)
  assert.ok(vault.takenIds.has('wi-0004'))
  assert.ok(vault.takenStems.has('build server'))
})

test('findVaultRoot walks up from a nested directory', async () => {
  fixture = vaultWithTree()
  assert.equal(findVaultRoot(join(fixture.root, 'Boards')), fixture.root)
  assert.equal(findVaultRoot(fixture.root), fixture.root)
})

test('findVaultRoot returns null outside a vault', () => {
  assert.equal(findVaultRoot('/'), null)
})

test('childrenOf sorts by priority ascending, then updated descending (decision q6)', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-09-01', updated: '2026-09-01',
  }))
  const child = (id: string, stem: string, extra: Record<string, string | number>) =>
    fixture!.write(`Boards/${stem}.md`, item({
      type: 'work-item', id, title: stem, status: 'backlog', parent: '"[[Main]]"',
      created: '2026-09-01', ...extra,
    }))
  child('wi-a', 'Alpha', { priority: 2, updated: '2026-09-10' })
  child('wi-b', 'Bravo', { priority: 1, updated: '2026-09-01' })
  child('wi-c', 'Charlie', { updated: '2026-09-20' })
  child('wi-d', 'Delta', { updated: '2026-09-22' })

  const vault = await loadVault(fixture.root)
  assert.deepEqual(
    vault.childrenOf(vault.byId.get('wi-0001')!).map((i) => i.id),
    ['wi-b', 'wi-a', 'wi-d', 'wi-c'],
    'priority first, then the most recently updated of the unprioritised',
  )
})
