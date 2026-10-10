import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { applyEdits, withStamp, writeAtomic, writeNew, withFileLock, lockPathFor, isSameLock } from './write.ts'
import { editItem } from '../shared/edit-item.ts'
import { parseFrontmatter } from '../shared/frontmatter.ts'
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

test('writeAtomic keeps the existing file mode', async () => {
  fixture = makeVault()
  const path = fixture.write('Boards/Private.md', TEXT)
  chmodSync(path, 0o600)

  await writeAtomic(path, 'replaced\n')

  assert.equal(statSync(path).mode & 0o777, 0o600)
})

test('editItem writes the change to disk and stamps updated', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main' }))
  const path = fixture.write('Boards/Build server.md', TEXT)
  const vault = await loadVault(fixture.root)
  await editItem(vault, vault.byId.get('wi-0004')!, [{ op: 'set', key: 'status', value: 'doing' }])

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

  assert.equal(await editItem(vault, workItem, []), TEXT)
  assert.equal(await editItem(vault, workItem, [{ op: 'set', key: 'status', value: 'backlog' }]), TEXT)
  assert.equal(readFileSync(path, 'utf8'), TEXT)
})

test('editItem stamps updated when only the body edit changes the file', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main' }))
  const path = fixture.write('Boards/Build server.md', TEXT)
  const vault = await loadVault(fixture.root)
  const workItem = vault.byId.get('wi-0004')!

  const after = await editItem(vault, workItem, [{ op: 'set', key: 'status', value: 'backlog' }], (text) => `${text}\nA note.\n`)
  assert.doesNotMatch(after, /^updated: 2026-09-21$/m)
  assert.match(after, /^updated: \d{4}-\d{2}-\d{2}$/m)
  assert.equal(readFileSync(path, 'utf8'), after)
})

test('editItem applies its edits to the file as it is now, not as it was loaded', async () => {
  fixture = makeVault()
  const path = fixture.write('Boards/Build server.md', TEXT)
  const vault = await loadVault(fixture.root)
  const loaded = vault.resolve('wi-0004')
  writeFileSync(path, TEXT.replace('Human prose', 'A newer edit. Human prose'))
  await editItem(vault, loaded, [{ op: 'set', key: 'status', value: 'doing' }])
  const after = readFileSync(path, 'utf8')
  assert.match(after, /^status: doing$/m)
  assert.match(after, /A newer edit\./)
})

test('concurrent editItem calls on one file keep every write', async () => {
  fixture = makeVault()
  const path = fixture.write('Boards/Build server.md', TEXT)
  const vault = await loadVault(fixture.root)
  const loaded = vault.resolve('wi-0004')
  await Promise.all(Array.from({ length: 8 }, (_, n) =>
    editItem(vault, loaded, [], (text) => `${text}line ${n}\n`)))
  const after = readFileSync(path, 'utf8')
  for (let n = 0; n < 8; n++) assert.match(after, new RegExp(`^line ${n}$`, 'm'))
})

test('editItem computes a plan from the file as it is under the lock', async () => {
  fixture = makeVault()
  const path = fixture.write('Boards/Build server.md', TEXT)
  const vault = await loadVault(fixture.root)
  const loaded = vault.resolve('wi-0004')
  writeFileSync(path, TEXT.replace('status: backlog', 'status: doing'))
  let seen: string | undefined
  await editItem(vault, loaded, (text) => {
    seen = String(parseFrontmatter(text)?.get('status'))
    return [{ op: 'set', key: 'prev_status', value: seen }]
  })
  assert.equal(seen, 'doing')
  assert.match(readFileSync(path, 'utf8'), /^prev_status: doing$/m)
})

test('editItem writes nothing when a plan returns null, and a plan that throws writes nothing', async () => {
  fixture = makeVault()
  const path = fixture.write('Boards/Build server.md', TEXT)
  const vault = await loadVault(fixture.root)
  const loaded = vault.resolve('wi-0004')
  assert.equal(await editItem(vault, loaded, () => null), TEXT)
  await assert.rejects(editItem(vault, loaded, () => { throw new Error('refused') }), /refused/)
  assert.equal(readFileSync(path, 'utf8'), TEXT)
  // The lock is free again after the refusal.
  await editItem(vault, loaded, [{ op: 'set', key: 'status', value: 'doing' }])
})

test('writeNew refuses to replace an existing file and leaves no temporary file', async () => {
  fixture = makeVault()
  const path = fixture.write('Boards/Tmp.md', TEXT)
  await assert.rejects(writeNew(path, 'other\n'), (error: NodeJS.ErrnoException) => error.code === 'EEXIST')
  assert.equal(readFileSync(path, 'utf8'), TEXT)
  const fresh = join(fixture.root, 'Boards/Fresh.md')
  await writeNew(fresh, 'new\n')
  assert.equal(readFileSync(fresh, 'utf8'), 'new\n')
  assert.deepEqual(readdirSync(join(fixture.root, 'Boards')).sort(), ['Fresh.md', 'Tmp.md'])
})

test('two processes that both find a stale lock never both hold it', async () => {
  fixture = makeVault()
  const target = join(fixture.root, 'Boards/Locked.md')
  const lock = lockPathFor(target)
  writeFileSync(lock, 'dead process\n')
  const old = new Date(Date.now() - 60_000)
  utimesSync(lock, old, old)

  let inside = 0
  let most = 0
  const enter = () => { inside++; most = Math.max(most, inside) }
  let bHolds!: () => void
  const bHolding = new Promise<void>((resolve) => { bHolds = resolve })

  // A judges the lock stale, then waits until B has taken the lock over and holds it.
  const a = withFileLock(target, async () => { enter(); inside-- }, { afterStaleCheck: () => bHolding })
  const b = withFileLock(target, async () => {
    enter()
    bHolds()
    // A acts on its stale judgement while B holds the lock.
    await sleep(100)
    inside--
  })
  await Promise.all([a, b])
  assert.equal(most, 1, 'the two lock takers never overlapped')
  assert.equal(existsSync(lock), false, 'the lock is gone when both are done')
})

test('a fresh lock that reuses the stale lock\'s inode is a different lock', () => {
  // Linux reuses a freed inode at once, so the inode alone cannot tell the two apart.
  const stale = { ino: 42, mtimeMs: Date.now() - 60_000 }
  assert.equal(isSameLock(stale, { ino: 42, mtimeMs: Date.now() }), false)
  assert.equal(isSameLock(stale, { ...stale }), true)
})

test('a process whose lock was taken over as stale does not remove the new lock', async () => {
  fixture = makeVault()
  const target = join(fixture.root, 'Boards/Locked.md')
  const lock = lockPathFor(target)
  await withFileLock(target, async () => {
    // Another process judged this lock stale and took it over.
    rmSync(lock, { force: true })
    writeFileSync(lock, 'another process\n')
  })
  assert.equal(readFileSync(lock, 'utf8'), 'another process\n')
  rmSync(lock, { force: true })
})
