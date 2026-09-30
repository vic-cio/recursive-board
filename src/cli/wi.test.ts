import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

async function wi(args: string[], vault?: string, env: NodeJS.ProcessEnv = {}): Promise<Result> {
  try {
    const { stdout, stderr } = await run('node', [CLI, ...args], {
      // A blank WI_CREATOR and WI_MODEL mean unset, so the caller's shell cannot change a result.
      env: { ...process.env, WI_CREATOR: '', WI_MODEL: '', WI_VAULT: vault ?? fixture!.root, ...env },
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string }
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

test('wi agents prints the configured agent limit and claimed doing count', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"maxAgents":2}')
  const source = readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8')
    .replace('owner: sam', 'owner: sam\nagent: codex')
  writeFileSync(join(fixture.root, 'Boards/Build server.md'), source)
  fixture.write('Boards/Another.md', item({
    type: 'work-item', id: 'wi-0005', title: 'Another', status: 'doing', agent: 'claude',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  fixture.write('Boards/Waiting.md', item({
    type: 'work-item', id: 'wi-0006', title: 'Waiting', status: 'options', agent: 'pi',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))

  fixture.write('Boards/Subtask.md', item({
    type: 'work-item', id: 'wi-0007', title: 'Subtask', status: 'doing', agent: 'codex',
    parent: '"[[Build server]]"', created: '2026-09-21', updated: '2026-09-21',
  }))

  const result = await wi(['agents', '--json'])
  assert.equal(result.code, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.maxAgents, 2)
  assert.equal(report.activeAgents, 2, 'codex holds a card and its subtask, and counts once')
  assert.deepEqual(report.claims.map((c: { agent: string; id: string }) => `${c.agent} ${c.id}`).sort(),
    ['claude wi-0005', 'codex wi-0004', 'codex wi-0007'])
})

test('wi ready --json returns dispatchable options and exclusion reasons', async () => {
  fixture = seed()
  fixture.write('Boards/Ready.md', item({ type: 'work-item', id: 'wi-ready', title: 'Ready',
    status: 'options', parent: '"[[Main]]"', priority: 1 }))
  fixture.write('Boards/Blocked.md', item({ type: 'work-item', id: 'wi-blocked', title: 'Blocked',
    status: 'options', parent: '"[[Main]]"', blocked: true }))
  const result = await wi(['ready', '--json'])
  assert.equal(result.code, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(report.ready.map((card: { id: string }) => card.id), ['wi-ready'])
  assert.deepEqual(report.excluded.map((card: { id: string; reasons: string[] }) =>
    [card.id, card.reasons]), [['wi-blocked', ['blocked']]])
  const scoped = await wi(['ready', '--parent', 'wi-0004', '--json'])
  assert.equal(scoped.code, 0, scoped.stderr)
  assert.equal(JSON.parse(scoped.stdout).scope.id, 'wi-0004')
  assert.deepEqual(JSON.parse(scoped.stdout).ready, [])
})

test('wi show --json returns a complete card without changing its file', async () => {
  fixture = seed()
  const before = readFixture('Boards/Build server.md')
  const result = await wi(['show', 'wi-0004', '--json'])
  assert.equal(result.code, 0, result.stderr)
  const card = JSON.parse(result.stdout)
  assert.equal(card.id, 'wi-0004')
  assert.equal(card.owner, 'sam')
  assert.deepEqual(card.ancestry.map((entry: { id: string }) => entry.id), ['wi-0001'])
  assert.deepEqual(card.children, { total: 0, open: 0, done: 0, items: [] })
  assert.equal(readFixture('Boards/Build server.md'), before)
})

test('WI_MAX_AGENTS overrides the vault config for one dispatcher run', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"maxAgents":2}')
  const result = await wi(['agents', '--json'], undefined, { WI_MAX_AGENTS: '5' })
  assert.equal(result.code, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).maxAgents, 5)
})

test('an empty WI_MAX_AGENTS removes the cap for that run', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"maxAgents":2}')
  const result = await wi(['agents', '--json'], undefined, { WI_MAX_AGENTS: '' })
  assert.equal(result.code, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).maxAgents, null)
})

test('WI_MAX_AGENTS must be a non-negative whole number', async () => {
  fixture = seed()
  const result = await wi(['agents'], undefined, { WI_MAX_AGENTS: '1.5' })
  assert.equal(result.code, 2)
  assert.match(result.stderr, /WI_MAX_AGENTS must be a non-negative whole number/)
})

test('wi config is no longer a command: the plugin moves the settings', async () => {
  fixture = seed()
  const result = await wi(['config', 'migrate'])
  assert.equal(result.code, 2)
  assert.match(result.stderr, /unknown command "config"/)
})

test('wi reads the board key from the plugin data file and prints no hint', async () => {
  fixture = seed()
  fixture.write('.obsidian/plugins/recursive-board/data.json', '{"board":{"maxAgents":3}}')
  fixture.write('.wi.json', '{"maxAgents":1}')
  const result = await wi(['agents'])
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /3/)
  assert.doesNotMatch(result.stderr, /Open the vault in Obsidian/)
})

for (const [file, text] of [
  ['.wi.json', '{"maxAgents":1}'],
  ['Recursive Board config.md', '<!-- recursive-board-config -->\n```json\n{"maxAgents":1}\n```\n'],
] as const) {
  test(`wi prints one hint line when it reads ${file}`, async () => {
    fixture = seed()
    fixture.write(file, text)
    const result = await wi(['agents'])
    assert.equal(result.code, 0, result.stderr)
    const hints = result.stderr.split('\n').filter((line) => line.includes('Open the vault in Obsidian'))
    assert.equal(hints.length, 1)
    assert.match(hints[0]!, new RegExp(file.replace('.', '\\.')))
  })
}

function readFixture(path: string): string | null {
  const fullPath = join(fixture!.root, path)
  return existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : null
}

test('wi claim remains advisory when the active agent count reaches the limit', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"maxAgents":0}')
  const result = await wi(['claim', 'wi-0004', '--agent', 'codex'])
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /doing/)
  assert.match(result.stderr, /agent limit is 0/)
})

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
  assert.match(stdout, /wi area <ref> \[--off\]/)
  assert.match(stdout, /It refuses a card\s+with an agent/i)
  assert.match(stdout, /wi agents/)
})

test('wi area converts a card to an area and back while preserving its status', async () => {
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
  assert.match(text, /^status: options$/m)
  assert.doesNotMatch(text, /^prev_status:/m)

  const toCard = await wi(['area', 'wi-0004', '--off', '--json'])
  assert.equal(toCard.code, 0, toCard.stderr)
  assert.equal(JSON.parse(toCard.stdout).status, 'options')
  text = readFileSync(path, 'utf8')
  assert.doesNotMatch(text, /^area:/m)
  assert.match(text, /^status: options$/m)
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

test('wi move repairs a malformed parent link', async () => {
  fixture = seed()
  fixture.write('Boards/Lost.md', item({
    type: 'work-item', id: 'wi-0010', title: 'Lost', status: 'backlog', parent: 'broken link',
    created: '2026-09-21', updated: '2026-09-21',
  }))

  const moved = await wi(['move', 'wi-0010', '--to', 'Main'])
  assert.equal(moved.code, 0, moved.stderr)
  assert.match(readFileSync(join(fixture.root, 'Boards/Lost.md'), 'utf8'), /parent: "\[\[Main\]\]"/)
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

test('wi new writes a brief from flags, and --strict refuses a card without one', async () => {
  fixture = seed()
  const made = await wi(['new', 'Price demolition', '--parent', 'Main', '--objective', 'Price every line.',
    '--context', 'Survey.', '--criteria', 'Each line has a rate', '--criteria', 'Total checked', '--creator', 'Ana', '--json'])
  assert.equal(made.code, 0, made.stderr)
  assert.equal(made.stderr, '')
  const text = readFileSync(join(fixture.root, JSON.parse(made.stdout).path), 'utf8')
  assert.match(text, /## Acceptance Criteria\n\n- Each line has a rate\n- Total checked\n/)

  const bare = await wi(['new', 'Bare', '--parent', 'Main'])
  assert.equal(bare.code, 0)
  assert.match(bare.stderr, /has no Objective or Acceptance Criteria/)

  const strict = await wi(['new', 'Strict', '--parent', 'Main', '--strict'])
  assert.equal(strict.code, 2)
  assert.match(strict.stderr, /no Objective or Acceptance Criteria/)
})

test('wi new writes creator, model and role as plain names, from flags or the environment', async () => {
  fixture = seed()
  const flags = await wi(['new', 'Check rates', '--parent', 'Main', '--objective', 'Check.', '--criteria', 'Done',
    '--creator', 'Project lead', '--model', 'gpt-6-luna', '--role', '[[Checker]]', '--owner', 'Ana', '--json'])
  assert.equal(flags.code, 0, flags.stderr)
  const text = readFileSync(join(fixture.root, JSON.parse(flags.stdout).path), 'utf8')
  assert.match(text, /^owner: Ana$/m)
  assert.match(text, /^role: Checker\ncreator: Project lead\ncreator_model: gpt-6-luna$/m)

  const env = await wi(['new', 'From env', '--parent', 'Main', '--json'], undefined, { WI_CREATOR: 'Session agent', WI_MODEL: 'claude-opus-5-5' })
  const envText = readFileSync(join(fixture.root, JSON.parse(env.stdout).path), 'utf8')
  assert.match(envText, /^creator: Session agent\ncreator_model: claude-opus-5-5$/m)
  assert.doesNotMatch(env.stderr, /no creator/)

  const bare = await wi(['new', 'Nobody', '--parent', 'Main', '--objective', 'x', '--criteria', 'y'])
  assert.match(bare.stderr, /has no creator/)
  const strict = await wi(['new', 'Strict nobody', '--parent', 'Main', '--objective', 'x', '--criteria', 'y', '--strict'])
  assert.equal(strict.code, 2)
  assert.match(strict.stderr, /no creator/)
})

test('wi validate checks creator, owner and role names against notes anywhere', async () => {
  fixture = seed()
  fixture.write('People/Ana.md', '---\ntype: person\n---\n')
  fixture.write('Roles/Checker.md', '---\ntype: role\n---\nThe procedure.\n')
  fixture.write('Notes/Loose.md', 'no frontmatter\n')
  const base = { type: 'work-item', status: 'options', parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21' }
  fixture.write('Boards/Good.md', item({ ...base, id: 'wi-9001', title: 'Good', creator: 'Checker', creator_model: 'gpt-6-luna', owner: 'Ana', role: 'Checker' }))
  fixture.write('Boards/Bad.md', item({ ...base, id: 'wi-9002', title: 'Bad', creator: 'Nobody', owner: 'Checker', role: 'Loose' }))
  fixture.write('Boards/Linked.md', item({ ...base, id: 'wi-9003', title: 'Linked', creator: '"[[Ana]]"', owner: 'sam' }))
  const result = await wi(['validate', '--json'])
  const problems = (JSON.parse(result.stdout) as { problems: { relPath: string; rule: string }[] }).problems
    .filter((problem) => ['Boards/Good.md', 'Boards/Bad.md', 'Boards/Linked.md'].includes(problem.relPath))
    .map((problem) => `${problem.relPath} ${problem.rule}`)
  assert.deepEqual(problems, [
    'Boards/Bad.md creator-unknown',
    'Boards/Bad.md owner-type',
    'Boards/Bad.md role-type',
    'Boards/Linked.md creator-link',
  ])
})

test('wi note names the writer by role and model', async () => {
  fixture = seed()
  const result = await wi(['note', 'Build server', 'Checked', 'rates.'], undefined, { WI_CREATOR: 'Checker', WI_MODEL: 'gpt-6-luna' })
  assert.equal(result.code, 0, result.stderr)
  assert.match(readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8'), /, Checker \(gpt-6-luna\): Checked rates\.\n$/)
})

test('wi note appends a stamped line naming the agent', async () => {
  fixture = seed()
  const result = await wi(['note', 'Build server', 'Priced', '12 lines.', '--agent', 'dispatcher'])
  assert.equal(result.code, 0, result.stderr)
  const text = readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8')
  assert.match(text, /## Notes\n\n- \d{4}-\d{2}-\d{2} \d{2}:\d{2}, dispatcher: Priced 12 lines\.\n$/)
})

test('brief flags outside wi new are refused', async () => {
  fixture = seed()
  const result = await wi(['status', 'Build server', 'done', '--objective', 'x'])
  assert.equal(result.code, 2)
  assert.match(result.stderr, /apply only to wi new/)
})

test('wi children marks a blocked card', async () => {
  fixture = seed()
  fixture.write('Boards/Stuck.md', item({
    type: 'work-item', id: 'wi-0009', title: 'Stuck', status: 'options', blocked: true,
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const text = await wi(['children', 'Main'])
  assert.match(text.stdout, /wi-0009 +options +Stuck +\[blocked\]/)
  const json = await wi(['children', 'Main', '--json'])
  assert.equal(JSON.parse(json.stdout).children.find((c: { id: string }) => c.id === 'wi-0009').blocked, true)
})
