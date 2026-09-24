import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.equal(code, 0)
  assert.equal(stdout.trim(), pkg.version)
})

test('wi with no command prints help and exits 2', async () => {
  fixture = seed()
  const { code, stdout } = await wi([])
  assert.equal(code, 2)
  assert.match(stdout, /Usage/)
})

test('wi --help documents area conversion', async () => {
  fixture = seed()
  const { code, stdout } = await wi(['--help'])
  assert.equal(code, 0)
  assert.match(stdout, /wi area <ref> \[--off --status <status>\]/)
  assert.match(stdout, /in doing or with an agent/i)
})

test('wi area converts a card to an area and back with an explicit status', async () => {
  fixture = seed()
  const path = join(fixture.root, 'Boards/Build server.md')
  const source = readFileSync(path, 'utf8').replace(/^status: doing$/m, 'status: options')
  const withPrior = source.replace('status: options', 'status: options\nprev_status: backlog')
  writeFileSync(path, withPrior)

  const toArea = await wi(['area', 'wi-0004', '--json'])
  assert.equal(toArea.code, 0, toArea.stderr)
  assert.equal(JSON.parse(toArea.stdout).to, 'area')
  let text = readFileSync(path, 'utf8')
  assert.match(text, /^area: true$/m)
  assert.doesNotMatch(text, /^status:/m)
  assert.doesNotMatch(text, /^prev_status:/m)

  const toCard = await wi(['area', 'wi-0004', '--off', '--status', 'done', '--json'])
  assert.equal(toCard.code, 0, toCard.stderr)
  assert.equal(JSON.parse(toCard.stdout).status, 'done')
  text = readFileSync(path, 'utf8')
  assert.doesNotMatch(text, /^area:/m)
  assert.match(text, /^status: done$/m)
  assert.match(text, /^owner: sam$/m)
  assert.ok(text.endsWith('# Build server\n'))
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

test('wi claim and release expose JSON results and accept --vault', async () => {
  fixture = seed()
  const claimed = await wi(['claim', 'wi-0004', '--agent', 'codex', '--json', '--vault', fixture.root])
  assert.equal(claimed.code, 0, claimed.stderr)
  assert.deepEqual(JSON.parse(claimed.stdout), {
    id: 'wi-0004', path: 'Boards/Build server.md', agent: 'codex',
    from: 'doing', to: 'doing', changed: true,
  })
  const released = await wi(['release', 'wi-0004', '--reason', 'stopped', '--where', 'card/task', '--json'])
  assert.equal(released.code, 0, released.stderr)
  assert.deepEqual(JSON.parse(released.stdout), {
    id: 'wi-0004', path: 'Boards/Build server.md', agent: 'codex',
    from: 'doing', to: 'options', reason: 'stopped', where: 'card/task', changed: true,
  })
})

test('wi claim and release reject missing options with exit 2', async () => {
  fixture = seed()
  const missingAgent = await wi(['claim', 'wi-0004'])
  assert.equal(missingAgent.code, 2)
  assert.match(missingAgent.stderr, /--agent/)
  const missingReason = await wi(['release', 'wi-0004'])
  assert.equal(missingReason.code, 2)
  assert.match(missingReason.stderr, /--reason/)
})

test('wi claim refusal exits 2 and names the existing agent', async () => {
  fixture = seed()
  fixture.write('Boards/Build server.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Build server', status: 'doing',
    parent: '"[[Main]]"', agent: 'claude', created: '2026-09-21', updated: '2026-09-21',
  }))
  const { code, stderr } = await wi(['claim', 'wi-0004', '--agent', 'codex'])
  assert.equal(code, 2)
  assert.match(stderr, /already claimed by claude/i)
})

test('wi --help lists claim and release', async () => {
  fixture = seed()
  const { code, stdout } = await wi(['--help'])
  assert.equal(code, 0)
  assert.match(stdout, /wi claim <ref> --agent <name>/)
  assert.match(stdout, /wi release <ref> --reason <text>/)
})

test('wi promote and demote expose JSON results and are idempotent', async () => {
  fixture = seed()
  const promoted = await wi(['promote', 'wi-0001', '--json'])
  assert.equal(promoted.code, 0, promoted.stderr)
  assert.deepEqual(JSON.parse(promoted.stdout), {
    id: 'wi-0001', path: 'Boards/Main.md', promoted: true, changed: true,
  })
  const before = readFileSync(join(fixture.root, 'Boards/Main.md'), 'utf8')
  const repeated = await wi(['promote', 'wi-0001', '--json'])
  assert.deepEqual(JSON.parse(repeated.stdout), {
    id: 'wi-0001', path: 'Boards/Main.md', promoted: true, changed: false,
  })
  assert.equal(readFileSync(join(fixture.root, 'Boards/Main.md'), 'utf8'), before)

  const demoted = await wi(['demote', 'wi-0001', '--json'])
  assert.equal(demoted.code, 0, demoted.stderr)
  assert.deepEqual(JSON.parse(demoted.stdout), {
    id: 'wi-0001', path: 'Boards/Main.md', promoted: false, changed: true,
  })
  assert.doesNotMatch(readFileSync(join(fixture.root, 'Boards/Main.md'), 'utf8'), /^board:/m)
})

test('wi --help lists promote and demote', async () => {
  fixture = seed()
  const { code, stdout } = await wi(['--help'])
  assert.equal(code, 0)
  assert.match(stdout, /wi promote <ref>/)
  assert.match(stdout, /wi demote <ref>/)
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

test('wi archive and --undo use the same unaccounted-file guard as rm and move', async () => {
  fixture = seed()
  fixture.write('Boards/.Child.md.icloud', 'bplist00')

  const archived = await wi(['archive', 'wi-0004'])
  const undone = await wi(['archive', 'wi-0004', '--undo'])
  const removed = await wi(['rm', 'wi-0004'])
  const moved = await wi(['move', 'wi-0004', '--to', 'Main'])

  for (const result of [archived, undone, removed, moved]) {
    assert.equal(result.code, 2)
    assert.match(result.stderr, /Boards\/\.Child\.md\.icloud/)
    assert.match(result.stderr, /cannot (archive|unarchive|remove|move).*not accounted for/i)
  }
  assert.match(archived.stderr, /cannot archive Build server:/)
  assert.match(undone.stderr, /cannot unarchive Build server:/)
})

test('non-destructive commands still run while a file is unaccounted for', async () => {
  fixture = seed()
  fixture.write('Boards/.Child.md.icloud', 'bplist00')

  const created = await wi(['new', 'Streaming', '--parent', 'wi-0004', '--json'])
  assert.equal(created.code, 0, created.stderr)
  assert.match(created.stderr, /Boards\/\.Child\.md\.icloud/)
  assert.match(created.stderr, /new id or filename may clash with an unread file/i)
  const { id } = JSON.parse(created.stdout)

  const listed = await wi(['children', 'wi-0004', '--json'])
  assert.equal(listed.code, 0, listed.stderr)
  assert.ok(JSON.parse(listed.stdout).children.some((c: { id: string }) => c.id === id))

  const moved = await wi(['status', id, 'doing', '--json'])
  assert.equal(moved.code, 0, moved.stderr)
  assert.equal(JSON.parse(moved.stdout).to, 'doing')
})

test('wi validate warns when defaultRoot does not name a root work item', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"defaultRoot":"Build server"}')

  const { code, stdout } = await wi(['validate', '--json'])
  assert.equal(code, 0)
  const report = JSON.parse(stdout)
  const warning = report.problems.find((p: { rule: string }) => p.rule === 'default-root-unresolved')
  assert.ok(warning)
  assert.equal(warning.severity, 'warning')
  assert.match(warning.message, /root/i)
})

test('wi validate warns when defaultRoot names no work item', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"defaultRoot":"Missing"}')

  const { code, stdout } = await wi(['validate', '--json'])
  assert.equal(code, 0)
  const report = JSON.parse(stdout)
  assert.ok(report.problems.some((p: { rule: string }) => p.rule === 'default-root-unresolved'))
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

test('wi archive hides a card, --archived lists it, and --undo restores it', async () => {
  fixture = seed()
  const archived = await wi(['archive', 'Build server', '--json'])
  assert.equal(archived.code, 0, archived.stderr)
  assert.equal(JSON.parse(archived.stdout).archived, true)
  assert.match(readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8'), /^archived: true$/m)

  const hidden = JSON.parse((await wi(['children', 'Main', '--json'])).stdout)
  assert.deepEqual(hidden.children, [])
  const shown = JSON.parse((await wi(['children', 'Main', '--archived', '--json'])).stdout)
  assert.equal(shown.children[0].id, 'wi-0004')
  assert.equal(shown.children[0].archived, true)

  const undone = await wi(['archive', 'wi-0004', '--undo'])
  assert.equal(undone.code, 0, undone.stderr)
  assert.doesNotMatch(readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8'), /^archived:/m)
  assert.equal(JSON.parse((await wi(['children', 'Main', '--json'])).stdout).children.length, 1)
})
