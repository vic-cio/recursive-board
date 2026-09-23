import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { makeVault, item, type Fixture } from './test-helpers.ts'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('./wi.ts', import.meta.url))

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

interface Result { code: number; stdout: string; stderr: string }

async function wi(args: string[], vault?: string): Promise<Result> {
  try {
    const { stdout, stderr } = await run('node', [CLI, ...args], {
      env: { ...process.env, WI_VAULT: vault ?? fixture!.root },
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string }
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

function seed(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-22',
  }, '# Main\n'))
  f.write('Boards/Build server.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Build server', status: 'doing',
    parent: '"[[Main]]"', owner: 'sam', board: true,
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Build server\n'))
  return f
}

test('wi --version prints the version', async () => {
  fixture = seed()
  const { code, stdout } = await wi(['--version'])
  assert.equal(code, 0)
  assert.match(stdout, /^\d+\.\d+\.\d+$/m)
})

test('wi with no command prints help and exits 2', async () => {
  fixture = seed()
  const { code, stdout } = await wi([])
  assert.equal(code, 2)
  assert.match(stdout, /Usage/)
})

test('wi validate exits 0 on a healthy vault', async () => {
  fixture = seed()
  const { code, stdout } = await wi(['validate'])
  assert.equal(code, 0)
  assert.match(stdout, /^ok: 2 work items, 0 errors, 0 warnings$/m)
})

test('wi validate exits 1 on a broken vault, which makes it a pre-commit hook', async () => {
  fixture = seed()
  fixture.write('Boards/Broken.md', item({
    type: 'work-item', id: 'wi-0009', title: 'Broken', status: 'active',
    parent: '"[[Nowhere]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const { code, stdout } = await wi(['validate'])
  assert.equal(code, 1)
  assert.match(stdout, /\[status-invalid\]/)
  assert.match(stdout, /\[parent-unresolved\]/)
  assert.match(stdout, /^FAILED: /m)
})

test('wi validate --json is machine readable', async () => {
  fixture = seed()
  const { stdout } = await wi(['validate', '--json'])
  const report = JSON.parse(stdout)
  assert.equal(report.ok, true)
  assert.equal(report.items, 2)
  assert.deepEqual(report.problems, [])
})

test('the full loop: new, children, status, validate', async () => {
  fixture = seed()

  const created = await wi(['new', 'Streaming', '--parent', 'wi-0004', '--json'])
  assert.equal(created.code, 0)
  const { id, path } = JSON.parse(created.stdout)
  assert.match(id, /^wi-[a-z0-9]{4}$/)
  assert.equal(path, 'Boards/Streaming.md')

  const listed = await wi(['children', 'wi-0004', '--json'])
  const listing = JSON.parse(listed.stdout)
  assert.equal(listing.parent.board, true)
  assert.deepEqual(listing.children.map((c: { id: string }) => c.id), [id])
  assert.equal(listing.children[0].status, 'backlog')

  const moved = await wi(['status', id, 'done', '--json'])
  const change = JSON.parse(moved.stdout)
  assert.equal(change.from, 'backlog')
  assert.equal(change.to, 'done')
  assert.equal(change.prev_status, 'backlog')

  const text = readFileSync(join(fixture.root, 'Boards/Streaming.md'), 'utf8')
  assert.match(text, /^status: done$/m)
  assert.match(text, /^prev_status: backlog$/m)
  assert.match(text, /^parent: "\[\[Build server\]\]"$/m)

  const after = await wi(['validate'])
  assert.equal(after.code, 0, after.stdout)
})

test('wi new inherits owner from the parent', async () => {
  fixture = seed()
  const { stdout } = await wi(['new', 'Streaming', '--parent', 'Build server', '--json'])
  const { path } = JSON.parse(stdout)
  assert.match(readFileSync(join(fixture.root, path), 'utf8'), /^owner: sam$/m)
})

test('wi new uses the configured folder and root when --parent is omitted', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"workItemFolder":"Projects","defaultRoot":"Launch"}')
  fixture.write('Projects/Launch.md', item({
    type: 'work-item', id: 'wi-0100', title: 'Launch',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  rmSync(join(fixture.root, 'Boards'), { recursive: true })
  const result = await wi(['new', 'Plan', '--json'])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).path, 'Projects/Plan.md')
  assert.match(readFileSync(join(fixture.root, 'Projects/Plan.md'), 'utf8'),
    /^parent: "\[\[Launch\]\]"$/m)
})

test('wi new takes a multi-word title without quoting gymnastics', async () => {
  fixture = seed()
  const { stdout } = await wi(['new', 'Build', 'the', 'mobile', 'UI', '--parent', 'Main', '--json'])
  assert.equal(JSON.parse(stdout).path, 'Boards/Build the mobile UI.md')
})

test('wi children prints the four columns by default', async () => {
  fixture = seed()
  await wi(['new', 'Streaming', '--parent', 'wi-0004'])
  const { stdout } = await wi(['children', 'wi-0004'])
  for (const status of ['backlog', 'options', 'doing', 'done']) {
    assert.match(stdout, new RegExp(`^  ${status} \\(\\d+\\)$`, 'm'))
  }
  assert.match(stdout, /\[board\]/)
})

test('wi children --tree walks the whole subtree', async () => {
  fixture = seed()
  const a = JSON.parse((await wi(['new', 'Streaming', '--parent', 'wi-0004', '--json'])).stdout)
  await wi(['new', 'Frames', '--parent', a.id])
  const { stdout } = await wi(['children', 'wi-0004', '--tree', '--json'])
  const depths = JSON.parse(stdout).children.map((c: { depth: number }) => c.depth)
  assert.deepEqual(depths, [0, 1])
})

test('wi status reports a no-op rather than writing', async () => {
  fixture = seed()
  const before = readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8')
  const { code, stdout } = await wi(['status', 'wi-0004', 'doing'])
  assert.equal(code, 0)
  assert.match(stdout, /already doing/)
  assert.equal(readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8'), before)
})

test('an unresolvable ref exits 2 and says what to try', async () => {
  fixture = seed()
  const { code, stderr } = await wi(['status', 'wi-nope', 'doing'])
  assert.equal(code, 2)
  assert.match(stderr, /no work item matches "wi-nope"/)
  assert.match(stderr, /id, a filename or a title/)
})

test('a fifth status value exits 2 and names the four', async () => {
  fixture = seed()
  const { code, stderr } = await wi(['status', 'wi-0004', 'active'])
  assert.equal(code, 2)
  assert.match(stderr, /backlog, options, doing, done/)
})

test('an unknown command exits 2', async () => {
  fixture = seed()
  const { code, stderr } = await wi(['frobnicate'])
  assert.equal(code, 2)
  assert.match(stderr, /unknown command/)
})

test('an unknown flag exits 2 rather than being ignored', async () => {
  fixture = seed()
  const { code } = await wi(['validate', '--deep'])
  assert.equal(code, 2)
})

test('a path that is not a vault exits 2 and says why', async () => {
  fixture = seed()
  const { code, stderr } = await wi(['validate', '--vault', '/tmp'], '/tmp')
  assert.equal(code, 2)
  assert.match(stderr, /no Boards\//)
})

test('wi never writes to the parent when a child changes', async () => {
  fixture = seed()
  const mainBefore = readFileSync(join(fixture.root, 'Boards/Main.md'), 'utf8')
  const serverBefore = readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8')
  const { stdout } = await wi(['new', 'Streaming', '--parent', 'wi-0004', '--json'])
  await wi(['status', JSON.parse(stdout).id, 'doing'])
  assert.equal(readFileSync(join(fixture.root, 'Boards/Main.md'), 'utf8'), mainBefore)
  assert.equal(readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8'), serverBefore)
})

test('wi rm refuses while a work-item folder file is unaccounted for, and names it', async () => {
  fixture = seed()
  fixture.write('Boards/.Child.md.icloud', 'bplist00')
  const { code, stderr } = await wi(['rm', 'wi-0004'])
  assert.equal(code, 2)
  assert.match(stderr, /Boards\/\.Child\.md\.icloud/)
  assert.match(stderr, /not accounted for/i)
  assert.match(stderr, /download/i)
})

test('wi move refuses while a work-item folder file is unaccounted for', async () => {
  fixture = seed()
  fixture.write('Boards/.Child.md.icloud', 'bplist00')
  const { code, stderr } = await wi(['move', 'wi-0004', '--to', 'Main'])
  assert.equal(code, 2)
  assert.match(stderr, /not accounted for/i)
})

test('non-destructive commands still run while a file is unaccounted for', async () => {
  fixture = seed()
  fixture.write('Boards/.Child.md.icloud', 'bplist00')

  const created = await wi(['new', 'Streaming', '--parent', 'wi-0004', '--json'])
  assert.equal(created.code, 0, created.stderr)
  const { id } = JSON.parse(created.stdout)

  const listed = await wi(['children', 'wi-0004', '--json'])
  assert.equal(listed.code, 0, listed.stderr)
  assert.ok(JSON.parse(listed.stdout).children.some((c: { id: string }) => c.id === id))

  const moved = await wi(['status', id, 'doing', '--json'])
  assert.equal(moved.code, 0, moved.stderr)
  assert.equal(JSON.parse(moved.stdout).to, 'doing')
})

test('wi validate warns about an unaccounted file without failing the vault', async () => {
  fixture = seed()
  fixture.write('Boards/.Child.md.icloud', 'bplist00')
  const { code, stdout } = await wi(['validate'])
  assert.equal(code, 0, stdout)
  assert.match(stdout, /\[unaccounted-file\]/)
  assert.match(stdout, /^ok: 2 work items, 0 errors, 1 warnings$/m)
})

test('wi move reparents, and the item then lists under the new parent', async () => {
  fixture = seed()
  const created = await wi(['new', 'Streaming', '--parent', 'wi-0004', '--json'])
  const { id } = JSON.parse(created.stdout)

  const moved = await wi(['move', id, '--to', 'Main'])
  assert.equal(moved.code, 0, moved.stderr)
  assert.match(moved.stdout, /Build server → Main/)

  const { stdout } = await wi(['children', 'Main', '--tree'])
  assert.match(stdout, /Streaming/)
})

test('wi move without --to exits 2 and says what it needs', async () => {
  fixture = seed()
  const { code, stderr } = await wi(['move', 'wi-0004'])
  assert.equal(code, 2)
  assert.match(stderr, /--to/)
})

test('wi move of the root exits 2', async () => {
  fixture = seed()
  const { code, stderr } = await wi(['move', 'Main', '--to', 'wi-0004'])
  assert.equal(code, 2)
  assert.match(stderr, /root/i)
})
