import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { makeVault, item, type Fixture } from './test-helpers.ts'
import { COMMAND_FLAGS, parseCommandLine } from './flags.ts'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('./wi.ts', import.meta.url))
const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
const SKILL = readFileSync(new URL('../../skills/recursive-board/SKILL.md', import.meta.url), 'utf8')

interface Result { code: number; stdout: string; stderr: string }

/** Runs wi with a throwaway HOME, so a command that ran by mistake cannot touch the user's config. */
async function wi(args: string[], vault: Fixture, home: string): Promise<Result> {
  try {
    const { stdout, stderr } = await run('node', [CLI, ...args], {
      env: { ...process.env, WI_AGENT: '', WI_MODEL: '', WI_VAULT: vault.root, HOME: home,
        XDG_CONFIG_HOME: join(home, '.config'), APPDATA: join(home, 'AppData') },
      cwd: home,
      timeout: 20_000,
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string }
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

function seed(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-22' }, '# Main\n'))
  f.write('Boards/Build server.md', item({ type: 'work-item', id: 'wi-0004', title: 'Build server',
    status: 'options', parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21' }, '# Build server\n'))
  return f
}

/** Every file under a folder with its size and mtime, so a test can see that nothing was written. */
function snapshot(root: string): string {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full)
      else out.push(`${full} ${stat.size} ${stat.mtimeMs} ${readFileSync(full, 'utf8')}`)
    }
  }
  walk(root)
  return out.join('\n')
}

test('wi archive --dry-run is refused and does not archive the card', async () => {
  const vault = seed()
  const home = mkdtempSync(join(tmpdir(), 'wi-home-'))
  try {
    const before = snapshot(vault.root)
    const result = await wi(['archive', 'Build server', '--dry-run'], vault, home)
    assert.equal(result.code, 2, result.stdout)
    assert.match(result.stderr, /wi archive does not take --dry-run/)
    assert.equal(snapshot(vault.root), before)
    assert.doesNotMatch(readFileSync(join(vault.root, 'Boards/Build server.md'), 'utf8'), /archived/)
  } finally {
    vault.cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})

test('wi template is a retired command and points to wi new --template without writing', async () => {
  const vault = seed()
  const home = mkdtempSync(join(tmpdir(), 'wi-home-'))
  try {
    const before = snapshot(vault.root)
    const result = await wi(['template', 'write'], vault, home)
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /use wi new --template/i)
    assert.equal(snapshot(vault.root), before)
  } finally {
    vault.cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})

test('--force is refused outside wi setup, and the help says an old hook keeps working', async () => {
  const vault = seed()
  const home = mkdtempSync(join(tmpdir(), 'wi-home-'))
  try {
    const refused = await wi(['validate', '--force'], vault, home)
    assert.equal(refused.code, 2)
    assert.match(refused.stderr, /--force applies only to wi setup\./)

    const help = await wi(['--help'], vault, home)
    assert.equal(help.code, 0)
    assert.doesNotMatch(help.stdout, /wi hook <install/, 'the usage list no longer offers hook management')
    assert.match(help.stdout, /removed `wi hook install` wrote keeps working/)
    assert.match(help.stdout, /Replace an unmanaged skill during setup\./)
  } finally {
    vault.cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})

/** Arguments that would make each command run, so a refusal must come before the work. */
const INVOCATIONS: Record<string, string[]> = {
  setup: ['setup', '--yes'],
  doctor: ['doctor'],
  update: ['update', '--dry-run', '--from', '0.8.2', '--json'],
  new: ['new', 'Another card', '--parent', 'Main'],
  status: ['status', 'Build server', 'doing'],
  note: ['note', 'Build server', 'A note.'],
  area: ['area', 'Build server'],
  tag: ['tag', 'Build server', 'design'],
  review: ['review', 'Build server', '--to', 'sam'],
  approve: ['approve', 'Build server', '--you', 'sam'],
  'send-back': ['send-back', 'Build server', '--you', 'sam', '--comment', 'Redo it.'],
  depend: ['depend', 'Build server', '--on', 'Main'],
  set: ['set', 'Build server', '--owner', 'sam'],
  claim: ['claim', 'Build server', '--holder', 'codex'],
  // A person, so a missed refusal could never start an agent.
  delegate: ['delegate', 'Build server', '--to', 'sam'],
  objective: ['objective'],
  agents: ['agents'],
  dashboard: ['dashboard', '--you', 'sam'],
  release: ['release', 'Build server', '--reason', 'stop'],
  move: ['move', 'Build server', '--to', 'Main'],
  archive: ['archive', 'Build server'],
  promote: ['promote', 'Build server'],
  demote: ['demote', 'Build server'],
  rm: ['rm', 'Build server'],
  children: ['children', 'Main'],
  ready: ['ready'],
  show: ['show', 'Build server'],
  validate: ['validate'],
  retag: ['retag'],
  graph: ['graph'],
  template: ['template', 'write'],
  here: ['here', '--board', 'Main'],
}

test('the table of invocations covers every command', () => {
  assert.deepEqual(Object.keys(INVOCATIONS).sort(), Object.keys(COMMAND_FLAGS).sort())
  assert.equal('trace' in COMMAND_FLAGS, false)
})

test('wi review accepts repeated --files values', () => {
  assert.deepEqual(COMMAND_FLAGS['review'], ['to', 'files', 'note', 'vault', 'json'])
  assert.deepEqual(parseCommandLine(['review', 'Task', '--to', 'Ana', '--files', 'a.pdf', '--files', 'b.md']).values['files'], ['a.pdf', 'b.md'])
})

test('wi review writes owner and a Review note, and returns the files as JSON', async () => {
  const vault = seed()
  vault.write('People/sam.md', '---\ntype: person\n---\n')
  const home = mkdtempSync(join(tmpdir(), 'wi-home-'))
  try {
    const result = await wi(['review', 'Build server', '--to', 'Sam', '--files', 'a.pdf', '--files', 'b.md', '--json'], vault, home)
    assert.equal(result.code, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
      id: 'wi-0004', path: 'Boards/Build server.md', owner: 'sam', files: ['a.pdf', 'b.md'],
    })
    const text = readFileSync(join(vault.root, 'Boards/Build server.md'), 'utf8')
    assert.match(text, /^owner: sam$/m)
    assert.match(text, /\*\*Review:\*\* Please review `a\.pdf`, `b\.md`\./)
  } finally {
    vault.cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})

test('wi approve and wi send-back give the verdict on a card sent for review', async () => {
  const vault = seed()
  vault.write('People/sam.md', '---\ntype: person\n---\n')
  vault.write('Boards/Build server.md', item({ type: 'work-item', id: 'wi-0004', title: 'Build server',
    status: 'doing', parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21' }, '# Build server\n'))
  const home = mkdtempSync(join(tmpdir(), 'wi-home-'))
  const path = join(vault.root, 'Boards/Build server.md')
  try {
    assert.equal((await wi(['review', 'Build server', '--to', 'sam', '--files', 'a.md'], vault, home)).code, 0)
    const missing = await wi(['approve', 'Build server'], vault, home)
    assert.equal(missing.code, 2)
    assert.match(missing.stderr, /--you <name>/)

    const back = await wi(['send-back', 'wi-0004', '--you', 'Sam', '--comment', 'Add the logs.', '--json'], vault, home)
    assert.equal(back.code, 0, back.stderr)
    assert.deepEqual(JSON.parse(back.stdout), {
      id: 'wi-0004', path: 'Boards/Build server.md', verdict: 'send back', you: 'Sam', status: 'doing',
      parent_ready: null, unblocked: [],
    })
    assert.match(readFileSync(path, 'utf8'), /: Sent back by Sam: Add the logs\.\n/)
    assert.doesNotMatch(readFileSync(path, 'utf8'), /^owner:/m)

    const early = await wi(['approve', 'wi-0004', '--you', 'sam'], vault, home)
    assert.equal(early.code, 2)
    assert.match(early.stderr, /Send it for review first/)

    assert.equal((await wi(['review', 'wi-0004', '--to', 'sam'], vault, home)).code, 0)
    const ok = await wi(['approve', 'wi-0004', '--you', 'sam'], vault, home)
    assert.equal(ok.code, 0, ok.stderr)
    assert.match(ok.stdout, /wi-0004 {2}Build server {2}approved by sam {2}doing → done/)
    assert.match(readFileSync(path, 'utf8'), /^status: done$/m)
  } finally {
    vault.cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})

for (const [command, args] of Object.entries(INVOCATIONS)) {
  test(`wi ${command} refuses an unknown flag and a flag it does not use, and writes nothing`, async () => {
    const vault = seed()
    const home = mkdtempSync(join(tmpdir(), 'wi-home-'))
    try {
      const before = snapshot(vault.root)
      const homeBefore = snapshot(home)

      const unknown = await wi([...args, '--no-such-flag'], vault, home)
      assert.equal(unknown.code, 2, unknown.stdout)
      assert.match(unknown.stderr, new RegExp(`wi ${command} does not take --no-such-flag`))

      // A flag another command uses. --undo belongs to wi archive; every other command gets --undo too,
      // except archive, which gets --dry-run (the defect this test was written for).
      const unused = command === 'archive' ? '--dry-run' : '--undo'
      const known = await wi([...args, unused], vault, home)
      assert.equal(known.code, 2, known.stdout)
      assert.match(known.stderr, new RegExp(`wi ${command} does not take ${unused}`))

      assert.equal(snapshot(vault.root), before, 'the vault is unchanged')
      assert.equal(snapshot(home), homeBefore, 'the user config is unchanged')
    } finally {
      vault.cleanup()
      rmSync(home, { recursive: true, force: true })
    }
  })
}

/** Each `wi <command> ... --flag` that the README or the skill shows, collected per command. */
function documentedFlags(text: string): [string, string][] {
  const found: [string, string][] = []
  for (const span of text.matchAll(/`(wi [^`]+)`/g)) {
    const words = span[1]!.split(/\s+/)
    const command = words[1]!
    if (!(command in COMMAND_FLAGS)) continue
    for (const word of words.slice(2)) {
      for (const flag of word.matchAll(/--([a-z][a-z-]*)/g)) found.push([command, flag[1]!])
    }
  }
  return found
}

test('every flag the README and the skill document on a command is one that command takes', () => {
  const documented = [...documentedFlags(README), ...documentedFlags(SKILL)]
  assert.ok(documented.length > 30, 'the scan finds the documented flags')
  for (const [command, flag] of documented) {
    assert.ok((COMMAND_FLAGS[command] as string[]).includes(flag), `wi ${command} --${flag} is documented`)
  }
})
