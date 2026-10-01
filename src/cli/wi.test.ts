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
      // Blank writer variables keep the caller's shell from changing a result.
      env: { ...process.env, WI_AGENT: '', WI_MODEL: '', WI_VAULT: vault ?? fixture!.root, ...env },
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string }
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

test('wi agents prints the configured agent limit and claimed doing count', async () => {
  fixture = seed()
  fixture.writeSettings('{"maxAgents":2}')
  const source = readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8')
    .replace('owner: sam', 'owner: sam\nagent: codex')
  writeFileSync(join(fixture.root, 'Boards/Build server.md'), source)
  fixture.write('Boards/Another.md', item({
    type: 'work-item', id: 'wi-0005', title: 'Another', status: 'doing', holder: 'claude',
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
  fixture.write('Boards/Asked.md', item({
    type: 'work-item', id: 'wi-0010', title: 'Asked', status: 'doing', holder: 'agent',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))

  const result = await wi(['agents', '--json'])
  assert.equal(result.code, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.maxAgents, 2)
  assert.equal(report.activeAgents, 2, 'codex holds a card and its subtask, and counts once; a request for any agent is no agent')
  assert.deepEqual(report.claims.map((c: { agent: string; id: string }) => `${c.agent} ${c.id}`).sort(),
    ['claude wi-0005', 'codex wi-0004', 'codex wi-0007'])
})

test('wi agents does not count a card a person holds, known by a note with type: person', async () => {
  fixture = seed()
  fixture.writeSettings('{"maxAgents":1}')
  fixture.write('People/Ana.md', '---\ntype: person\n---\n')
  fixture.write('Boards/Quote.md', item({
    type: 'work-item', id: 'wi-0008', title: 'Quote', status: 'doing', agent: 'ana',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  fixture.write('Boards/Code.md', item({
    type: 'work-item', id: 'wi-0009', title: 'Code', status: 'doing', agent: 'codex-code',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))

  const result = await wi(['agents', '--json'])
  assert.equal(result.code, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.activeAgents, 1)
  assert.deepEqual(report.claims.map((c: { agent: string }) => c.agent), ['codex-code'])

  const claim = await wi(['claim', 'wi-0004', '--agent', 'Ana'])
  assert.equal(claim.code, 0, claim.stderr)
  assert.doesNotMatch(claim.stderr, /agent limit/, 'a person claiming a card adds no agent')
})

test('wi ready --json returns dispatchable options and exclusion reasons', async () => {
  fixture = seed()
  fixture.write('Boards/Ready.md', item({ type: 'work-item', id: 'wi-ready', title: 'Ready',
    status: 'options', parent: '"[[Main]]"', priority: 1 }))
  fixture.write('Boards/Blocker.md', item({ type: 'work-item', id: 'wi-blocker', title: 'Blocker',
    status: 'backlog', parent: '"[[Main]]"' }))
  fixture.write('Boards/Waiting.md', item({ type: 'work-item', id: 'wi-waiting', title: 'Waiting',
    status: 'options', parent: '"[[Main]]"', depends_on: '"[[Blocker]]"' }))
  const result = await wi(['ready', '--json'])
  assert.equal(result.code, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(report.ready.map((card: { id: string }) => card.id), ['wi-ready'])
  assert.deepEqual(report.excluded.map((card: { id: string; reasons: string[] }) =>
    [card.id, card.reasons]), [['wi-waiting', ['dependency']]])
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
  assert.deepEqual(card.knowledge, [])
  assert.deepEqual(card.ancestry.map((entry: { id: string }) => entry.id), ['wi-0001'])
  assert.deepEqual(card.children, { total: 0, open: 0, done: 0, items: [] })
  assert.equal(readFixture('Boards/Build server.md'), before)
})

test('wi trace exits successfully with its removal notice', async () => {
  fixture = seed()
  const result = await wi(['trace', 'old source', '--heading', 'Old', '--claim', 'old claim'])
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /wi trace was removed in 0\.8\.0/)
  assert.match(result.stdout, /wi show <ref> --json/)
})

test('WI_MAX_AGENTS overrides the vault config for one dispatcher run', async () => {
  fixture = seed()
  fixture.writeSettings('{"maxAgents":2}')
  const result = await wi(['agents', '--json'], undefined, { WI_MAX_AGENTS: '5' })
  assert.equal(result.code, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).maxAgents, 5)
})

test('an empty WI_MAX_AGENTS removes the cap for that run', async () => {
  fixture = seed()
  fixture.writeSettings('{"maxAgents":2}')
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

test('wi reads the board key from the plugin data file and ignores the old config files', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"maxAgents":1}')
  fixture.write('Recursive Board config.md', '<!-- recursive-board-config -->\n```json\n{"maxAgents":2}\n```\n')
  const before = await wi(['agents', '--json'])
  assert.equal(before.code, 0, before.stderr)
  assert.equal(JSON.parse(before.stdout).maxAgents, null)
  assert.equal(before.stderr, '')

  fixture.writeSettings('{"maxAgents":3}')
  const after = await wi(['agents', '--json'])
  assert.equal(after.code, 0, after.stderr)
  assert.equal(JSON.parse(after.stdout).maxAgents, 3)
  assert.equal(after.stderr, '')
})

function readFixture(path: string): string | null {
  const fullPath = join(fixture!.root, path)
  return existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : null
}

test('wi claim remains advisory when the active agent count reaches the limit', async () => {
  fixture = seed()
  fixture.writeSettings('{"maxAgents":0}')
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
  assert.match(stdout, /It refuses a card\s+with a holder/i)
  assert.match(stdout, /wi agents/)
})

test('wi --help documents the holder and delegation to any agent', async () => {
  fixture = seed()
  const { code, stdout } = await wi(['--help'])
  assert.equal(code, 0)
  assert.match(stdout, /wi delegate <ref> --to <person\|agent\|claude\|codex\|pi>/)
  assert.match(stdout, /holder field names the person or agent/)
  assert.match(stdout, /--to agent\` writes holder: agent and starts nothing/)
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

test('removed area tag commands remain successful stubs', async () => {
  fixture = seed()
  for (const args of [['retag', '--dry-run'], ['graph']]) {
    const result = await wi(args)
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /removed in 0\.8\.0/i)
  }
  const help = await wi(['--help'])
  assert.doesNotMatch(help.stdout, /wi retag \[--dry-run\]/)
  assert.doesNotMatch(help.stdout, /wi graph\n/)
  assert.match(help.stdout, /wi retag and wi graph were removed in 0\.8\.0/i)
})

test('wi tag adds and removes a free tag, and takes a title with spaces', async () => {
  fixture = seed()
  const path = join(fixture.root, 'Boards/Build server.md')
  const added = await wi(['tag', 'Build', 'server', 'design'])
  assert.equal(added.code, 0, added.stderr)
  assert.match(added.stdout, /\+design$/m)
  assert.match(readFileSync(path, 'utf8'), /^tags:\n {2}- design$/m)

  const again = await wi(['tag', 'wi-0004', 'Design', '--json'])
  assert.equal(again.code, 0, again.stderr)
  assert.equal(JSON.parse(again.stdout).changed, false)

  const removed = await wi(['tag', 'wi-0004', '#design', '--off'])
  assert.equal(removed.code, 0, removed.stderr)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /^tags:/m)
  assert.ok(readFileSync(path, 'utf8').endsWith('# Build server\n'))
})

test('wi tag refuses an area tag and a missing tag with exit 2', async () => {
  fixture = seed()
  const before = readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8')
  const area = await wi(['tag', 'wi-0004', 'area/work'])
  assert.equal(area.code, 2)
  assert.match(area.stderr, /reserved for old area tags/)
  const missing = await wi(['tag', 'wi-0004'])
  assert.equal(missing.code, 2)
  assert.match(missing.stderr, /needs a <ref> and a <tag>/)
  assert.equal(readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8'), before)
  const help = await wi(['--help'])
  assert.match(help.stdout, /wi tag <ref> <tag> \[--off\]/)
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

test('wi new does not inherit owner from the parent', async () => {
  fixture = seed()
  const { stdout } = await wi(['new', 'Streaming', '--parent', 'Build server', '--json'])
  const { path } = JSON.parse(stdout)
  assert.doesNotMatch(readFileSync(join(fixture.root, path), 'utf8'), /^owner:/m)
})

test('wi new uses the configured folder and root when --parent is omitted', async () => {
  fixture = seed()
  fixture.writeSettings('{"workItemFolder":"Projects","defaultRoot":"Launch"}')
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

test('wi children --status includes matching areas in text and JSON', async () => {
  fixture = seed()
  fixture.write('Boards/Operations.md', item({
    type: 'work-item', id: 'wi-0090', title: 'Operations', area: true,
    status: 'doing', parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))

  const text = await wi(['children', 'Main', '--status', 'doing'])
  assert.equal(text.code, 0, text.stderr)
  assert.match(text.stdout, /^  Areas \(1\)$/m)
  assert.match(text.stdout, /wi-0090  doing\s+Operations  \[area\]/)
  assert.match(text.stdout, /wi-0004  doing\s+Build server/)

  const json = await wi(['children', 'Main', '--status', 'doing', '--json'])
  assert.equal(json.code, 0, json.stderr)
  const listing = JSON.parse(json.stdout)
  assert.deepEqual(listing.areas.map((row: { id: string }) => row.id), ['wi-0090'])
  assert.deepEqual(listing.children.map((row: { id: string }) => row.id), ['wi-0004'])
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
    id: 'wi-0004', path: 'Boards/Build server.md', holder: 'codex',
    from: 'doing', to: 'doing', changed: true,
  })
  const released = await wi(['release', 'wi-0004', '--reason', 'stopped', '--where', 'card/task', '--json'])
  assert.equal(released.code, 0, released.stderr)
  assert.deepEqual(JSON.parse(released.stdout), {
    id: 'wi-0004', path: 'Boards/Build server.md', holder: 'codex',
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
  fixture.writeSettings('{"defaultRoot":"Build server"}')

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
  fixture.writeSettings('{"defaultRoot":"Missing"}')

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
  assert.match(made.stderr, /--creator and --model are accepted but ignored/)
  const text = readFileSync(join(fixture.root, JSON.parse(made.stdout).path), 'utf8')
  assert.match(text, /## Acceptance Criteria\n\n- Each line has a rate\n- Total checked\n/)

  const bare = await wi(['new', 'Bare', '--parent', 'Main'])
  assert.equal(bare.code, 0)
  assert.match(bare.stderr, /has no Objective or Acceptance Criteria/)

  const strict = await wi(['new', 'Strict', '--parent', 'Main', '--strict'])
  assert.equal(strict.code, 2)
  assert.match(strict.stderr, /no Objective or Acceptance Criteria/)
})

test('wi new ignores creator and model flags with a note, and only writes an explicit role', async () => {
  fixture = seed()
  const flags = await wi(['new', 'Check rates', '--parent', 'Main', '--objective', 'Check.', '--criteria', 'Done',
    '--creator', 'Project lead', '--model', 'gpt-6-luna', '--role', '[[Checker]]', '--owner', 'Ana', '--json'])
  assert.equal(flags.code, 0, flags.stderr)
  const text = readFileSync(join(fixture.root, JSON.parse(flags.stdout).path), 'utf8')
  assert.match(text, /^owner: Ana$/m)
  assert.match(text, /^role: Checker$/m)
  assert.doesNotMatch(text, /^creator(?:_model)?:/m)
  assert.match(flags.stderr, /--creator and --model are accepted but ignored/)

  const env = await wi(['new', 'From env', '--parent', 'Main', '--json'], undefined, { WI_CREATOR: 'Session agent', WI_MODEL: 'claude-opus-5-5' })
  const envText = readFileSync(join(fixture.root, JSON.parse(env.stdout).path), 'utf8')
  assert.doesNotMatch(envText, /^creator(?:_model)?:/m)
  assert.doesNotMatch(env.stderr, /no creator/)

  const strict = await wi(['new', 'Strict nobody', '--parent', 'Main', '--objective', 'x', '--criteria', 'y', '--strict'])
  assert.equal(strict.code, 0, strict.stderr)
  assert.doesNotMatch(strict.stderr, /no creator/)
})

test('wi new does not copy an ancestor role, and an explicit --role is kept', async () => {
  fixture = seed()
  const base = { type: 'work-item', created: '2026-09-21', updated: '2026-09-21' }
  fixture.write('Boards/Coding board.md', item({ ...base, id: 'wi-7001', title: 'Coding board', status: 'doing',
    parent: '"[[Main]]"', role: '"[[Coder]]"', board: true }))
  fixture.write('Boards/Plain step.md', item({ ...base, id: 'wi-7002', title: 'Plain step', status: 'doing',
    parent: '"[[Coding board]]"', board: true }))
  fixture.write('Boards/Check step.md', item({ ...base, id: 'wi-7003', title: 'Check step', status: 'doing',
    parent: '"[[Plain step]]"', role: 'Checker', board: true }))
  const roleOf = async (args: string[]): Promise<string | null> => {
    const brief = args.includes('area') ? [] : ['--objective', 'x', '--criteria', 'y']
    const result = await wi(['new', ...args, ...brief, '--json'])
    assert.equal(result.code, 0, result.stderr)
    const text = readFileSync(join(fixture!.root, JSON.parse(result.stdout).path), 'utf8')
    return /^role: (.*)$/m.exec(text)?.[1] ?? null
  }

  assert.equal(await roleOf(['From the parent', '--parent', 'Coding board']), null)
  assert.equal(await roleOf(['From the grandparent', '--parent', 'Plain step']), null)
  assert.equal(await roleOf(['From the nearest', '--parent', 'Check step']), null)
  assert.equal(await roleOf(['No role above', '--parent', 'Build server']), null)
  assert.equal(await roleOf(['Explicit', '--parent', 'Check step', '--role', 'Reviewer']), 'Reviewer')
  assert.equal(await roleOf(['Explicitly none', '--parent', 'Check step', '--role', '']), null)
  assert.equal(await roleOf(['An area', '--parent', 'Coding board', '--template', 'area']), null)
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

test('wi note refuses an unnamed writer and signs WI_AGENT with its model', async () => {
  fixture = seed()
  const refused = await wi(['note', 'Build server', 'Checked', 'rates.'])
  assert.equal(refused.code, 2)
  assert.match(refused.stderr, /WI_AGENT.*--agent/)
  assert.doesNotMatch(readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8'), /Checked rates/)

  const result = await wi(['note', 'Build server', 'Checked', 'rates.'], undefined, { WI_AGENT: 'worker-1', WI_MODEL: 'gpt-6-luna' })
  assert.equal(result.code, 0, result.stderr)
  assert.match(readFileSync(join(fixture.root, 'Boards/Build server.md'), 'utf8'), /, worker-1 \(gpt-6-luna\): Checked rates\.\n$/)
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
  assert.match(result.stderr, /--objective applies only to wi new/)
})

test('wi children marks a card that waits on an open dependency', async () => {
  fixture = seed()
  fixture.write('Boards/Spec.md', item({ type: 'work-item', id: 'wi-spec', title: 'Spec', status: 'backlog',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21' }))
  fixture.write('Boards/Stuck.md', item({
    type: 'work-item', id: 'wi-0009', title: 'Stuck', status: 'options', depends_on: '"[[Spec]]"',
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }))
  const text = await wi(['children', 'Main'])
  assert.match(text.stdout, /wi-0009 +options +Stuck +\[waits on 1\]/)
  const json = await wi(['children', 'Main', '--json'])
  const child = JSON.parse(json.stdout).children.find((c: { id: string }) => c.id === 'wi-0009')
  assert.equal('blocked' in child, false)
  assert.equal(child.waits_on[0], 'wi-spec')
})
