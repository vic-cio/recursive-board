import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { applyEdits, withStamp, writeAtomic, editItem } from './write.ts'
import { loadVault } from './vault.ts'
import { makeVault, item, type Fixture } from './test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

const TEXT = `---
type: work-item
id: wi-0004
title: Build server
status: backlog
parent: "[[Main]]"
mystery_key: keep me
created: 2026-09-21
updated: 2026-09-21
---

# Build server

Human prose nobody may rewrite.
`

test('applyEdits runs set and remove in order', () => {
  const out = applyEdits(TEXT, [
    { op: 'set', key: 'status', value: 'done' },
    { op: 'set', key: 'prev_status', value: 'backlog' },
    { op: 'remove', key: 'board' },
  ])
  assert.match(out, /^status: done$/m)
  assert.match(out, /^prev_status: backlog$/m)
})

test('applyEdits preserves an unknown key and the body', () => {
  const out = applyEdits(TEXT, [{ op: 'set', key: 'status', value: 'doing' }])
  assert.match(out, /^mystery_key: keep me$/m)
  assert.ok(out.endsWith('# Build server\n\nHuman prose nobody may rewrite.\n'))
})

test('withStamp adds updated when the caller did not', () => {
  const edits = withStamp([{ op: 'set', key: 'status', value: 'doing' }], '2026-09-22')
  assert.deepEqual(edits.at(-1), { op: 'set', key: 'updated', value: '2026-09-22' })
})

test('withStamp leaves an explicit updated alone', () => {
  const edits = withStamp([{ op: 'set', key: 'updated', value: '2020-01-01' }], '2026-09-22')
  assert.equal(edits.length, 1)
})

test('writeAtomic leaves no temporary file behind', async () => {
  fixture = makeVault()
  const path = fixture.write('Boards/Tmp.md', TEXT)
  await writeAtomic(path, 'replaced\n')
  assert.equal(readFileSync(path, 'utf8'), 'replaced\n')
  const vault = await loadVault(fixture.root)
  assert.deepEqual(vault.misplaced, [])
})

test('editItem writes the change to disk and stamps updated', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main' }))
  const path = fixture.write('Boards/Build server.md', TEXT)
  const vault = await loadVault(fixture.root)
  await editItem(vault.byId.get('wi-0004')!, [{ op: 'set', key: 'status', value: 'doing' }])

  const after = readFileSync(path, 'utf8')
  assert.match(after, /^status: doing$/m)
  assert.match(after, /^updated: \d{4}-\d{2}-\d{2}$/m)
  assert.match(after, /^mystery_key: keep me$/m)
  assert.equal(after.match(/^updated:/gm)!.length, 1, 'updated is set, never duplicated')
})

test('editItem leaves updated and the file untouched when an edit changes nothing', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main' }))
  const path = fixture.write('Boards/Build server.md', TEXT)
  const vault = await loadVault(fixture.root)
  const workItem = vault.byId.get('wi-0004')!

  assert.equal(await editItem(workItem, []), TEXT)
  assert.equal(await editItem(workItem, [{ op: 'set', key: 'status', value: 'backlog' }]), TEXT)
  assert.equal(readFileSync(path, 'utf8'), TEXT)
})

test('editItem stamps updated when only the body edit changes the file', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main' }))
  const path = fixture.write('Boards/Build server.md', TEXT)
  const vault = await loadVault(fixture.root)
  const workItem = vault.byId.get('wi-0004')!

  const after = await editItem(workItem, [{ op: 'set', key: 'status', value: 'backlog' }], (text) => `${text}\nA note.\n`)
  assert.doesNotMatch(after, /^updated: 2026-09-21$/m)
  assert.match(after, /^updated: \d{4}-\d{2}-\d{2}$/m)
  assert.equal(readFileSync(path, 'utf8'), after)
})
