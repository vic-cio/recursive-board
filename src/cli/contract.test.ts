/**
 * The contract between the two storage ports (docs/adr/0076-a-storage-port-and-a-command-runner.md).
 *
 * Each case runs one command line through runCommand twice: on the Node port over a temp vault,
 * and on the Obsidian port over an in-memory fake of the Obsidian API. The replies and every file
 * must match byte for byte. The coverage test fails when a vault command has no case and is not
 * on NOT_YET; the cards that move the other commands into the registry empty that list.
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

import { COMMAND_FLAGS, parseCommandLine } from './flags.ts'
import { nodePort } from './node-port.ts'
import { makeVault, item, type Fixture } from './test-helpers.ts'
import { createContext, isRegistered, runCommand, type Reply } from '../shared/runner.ts'
import type { StoragePort } from '../shared/storage.ts'
import type { VaultSeams } from '../shared/vault.ts'
import { FOLDERS } from '../shared/schema.ts'
import { obsidianPort } from '../plugin/obsidian-port.ts'
import { fakeObsidian } from '../plugin/fake-obsidian.ts'

/** The machine-level commands, which the plugin serves in its own way. */
const NOT_VAULT_COMMANDS = new Set(['setup', 'doctor', 'update', 'hook'])

/** Vault commands with no contract case yet. Each card that moves a command into the registry takes it off. */
const NOT_YET = new Set([
  'new', 'note', 'area', 'tag', 'depend', 'set', 'claim', 'delegate', 'review', 'approve', 'send-back', 'objective',
  'dashboard', 'release', 'move', 'archive', 'promote', 'demote', 'rm',
  'retag', 'graph', 'template', 'here',
])

interface ContractCase {
  name: string
  /** The vault before the run: every file's text by vault-relative path. */
  files: Record<string, string>
  /** The arguments after `wi`. */
  argv: string[]
  /** What the reply must show, so a case cannot pass by both ports failing alike. */
  expect: { code: number; stdout?: RegExp; stderr?: RegExp; files?: Record<string, RegExp> }
}

const SEED: Record<string, string> = {
  'Boards/Main.md': item({ type: 'work-item', id: 'wi-0001', title: 'Main', board: true }),
  'Boards/Launch.md': item({ type: 'work-item', id: 'wi-0002', title: 'Launch', status: 'doing', parent: '"[[Main]]"', board: true }),
  'Boards/Build server.md': item({
    type: 'work-item', id: 'wi-0003', title: 'Build server', status: 'doing', parent: '"[[Launch]]"', updated: '2026-09-01',
    mystery_key: 'keep me',
  }, '## Notes\n\nHuman prose.\n'),
  'Boards/Write docs.md': item({
    type: 'work-item', id: 'wi-0004', title: 'Write docs', status: 'done', prev_status: 'options', parent: '"[[Launch]]"',
    updated: '2026-09-02',
  }),
  'Boards/Ship.md': item({
    type: 'work-item', id: 'wi-0005', title: 'Ship', status: 'backlog', parent: '"[[Main]]"', depends_on: '["[[Build server]]"]',
  }),
  'Knowledge/Note.md': '# A note\n',
}

/** A vault that validates clean, with an agent at work, a person, and a role procedure. */
const CLEAN: Record<string, string> = {
  'Boards/Main.md': item({ type: 'work-item', id: 'wi-0001', title: 'Main', board: true, created: '2026-09-01', updated: '2026-09-01' }),
  'Boards/Launch.md': item({
    type: 'work-item', id: 'wi-0002', title: 'Launch', status: 'doing', parent: '"[[Main]]"', board: true,
    created: '2026-09-01', updated: '2026-09-01',
  }),
  'Boards/Build server.md': item({
    type: 'work-item', id: 'wi-0003', title: 'Build server', status: 'doing', parent: '"[[Launch]]"', holder: 'sp-bot',
    tags: '[role/coder]', created: '2026-09-01', updated: '2026-09-03',
  }, '## Objective\n\nServe the API.\n\n## Acceptance Criteria\n\n- It starts\n'),
  'Boards/Write docs.md': item({
    type: 'work-item', id: 'wi-0004', title: 'Write docs', status: 'options', parent: '"[[Launch]]"', priority: 1,
    created: '2026-09-01', updated: '2026-09-02',
  }),
  'Boards/Ship.md': item({
    type: 'work-item', id: 'wi-0005', title: 'Ship', status: 'options', parent: '"[[Main]]"', depends_on: '["[[Build server]]"]',
    created: '2026-09-01', updated: '2026-09-01',
  }),
  'Boards/Review copy.md': item({
    type: 'work-item', id: 'wi-0006', title: 'Review copy', status: 'doing', parent: '"[[Launch]]"', holder: 'Victor',
    created: '2026-09-01', updated: '2026-09-01',
  }),
  'People/Victor.md': item({ type: 'person' }),
  'Roles/Coder.md': item({ type: 'role', tags: '[role/coder]' }, '## Procedure\n'),
}

const CASES: ContractCase[] = [
  {
    name: 'status: a move to done records prev_status and names the ready parent and the unblocked card',
    files: SEED,
    argv: ['status', 'Build server', 'done'],
    expect: {
      code: 0,
      stdout: /doing → done {2}\(prev_status: doing\)[\s\S]*Ship {2}waits on nothing open now[\s\S]*every child is done/,
      files: { 'Boards/Build server.md': /^status: done\nparent: "\[\[Launch\]\]"\nupdated: 2026-10-09\nmystery_key: keep me\nprev_status: doing\n/m },
    },
  },
  {
    name: 'status: an untick to prev_status clears the record',
    files: SEED,
    argv: ['status', 'wi-0004', 'options'],
    expect: { code: 0, stdout: /^wi-0004 {2}Write docs {2}done → options\n$/ },
  },
  {
    name: 'status: --json',
    files: SEED,
    argv: ['status', 'wi-0003', 'done', '--json'],
    expect: { code: 0, stdout: /"prev_status": "doing"/ },
  },
  {
    name: 'status: a card already in the status is not written',
    files: SEED,
    argv: ['status', 'Build server', 'doing'],
    expect: { code: 0, stdout: /is already doing\. Nothing written\./ },
  },
  {
    name: 'status: a root is refused',
    files: SEED,
    argv: ['status', 'Main', 'doing'],
    expect: { code: 2, stderr: /^wi: Boards\/Main\.md is a root/ },
  },
  {
    name: 'status: an unknown ref is refused',
    files: SEED,
    argv: ['status', 'Nope', 'done'],
    expect: { code: 2, stderr: /^wi: no work item matches "Nope"/ },
  },
  {
    name: 'status: a missing status is a usage error',
    files: SEED,
    argv: ['status', 'Build server'],
    expect: { code: 2, stderr: /^wi: wi status needs a <ref> and a <status>/ },
  },
  {
    name: 'children: the four status groups, with the board, area and waits-on marks',
    files: SEED,
    argv: ['children', 'Main'],
    expect: { code: 0, stdout: /^wi-0001 {2}Main {2}\[board\]\n {2}backlog \(1\)\n {4}wi-0005 {2}backlog {2}Ship {2}\[waits on 1\]\n {2}options \(0\)\n {2}doing \(1\)\n {4}wi-0002 {2}doing {4}Launch {2}\(2\) {2}\[board\]\n {2}done \(0\)\n$/ },
  },
  {
    name: 'children: --tree lists every level, indented',
    files: SEED,
    argv: ['children', 'Main', '--tree'],
    expect: { code: 0, stdout: /\n {4}wi-0003 {2}doing {4}Build server\n/ },
  },
  {
    name: 'children: --status filters the flat list',
    files: SEED,
    argv: ['children', 'Launch', '--status', 'done'],
    expect: { code: 0, stdout: /^wi-0002 {2}Launch {2}\[board\]\n {2}wi-0004 {2}done {5}Write docs\n$/ },
  },
  {
    name: 'children: --json names what each child waits on',
    files: SEED,
    argv: ['children', 'Main', '--json'],
    expect: { code: 0, stdout: /"waits_on": \[\n\s+"wi-0003"\n\s+\]/ },
  },
  {
    name: 'children: a missing ref is a usage error',
    files: SEED,
    argv: ['children'],
    expect: { code: 2, stderr: /^wi: wi children needs a <ref>\. A project's AGENTS\.md names its board\.\n$/ },
  },
  {
    name: 'show: the text form is the JSON, with the role procedure and the ancestry',
    files: CLEAN,
    argv: ['show', 'Build server'],
    expect: { code: 0, stdout: /"procedures": \[\n\s+\{\n\s+"tag": "role\/coder",\n\s+"notes": \[\n\s+"Roles\/Coder\.md"[\s\S]*"title": "Launch"/ },
  },
  {
    name: 'show: --json',
    files: CLEAN,
    argv: ['show', 'wi-0005', '--json'],
    expect: { code: 0, stdout: /"satisfied": false/ },
  },
  {
    name: 'show: a missing ref is a usage error',
    files: CLEAN,
    argv: ['show'],
    expect: { code: 2, stderr: /^wi: wi show needs a <ref>\.\n$/ },
  },
  {
    name: 'ready: the free option cards, and a count of the excluded',
    files: CLEAN,
    argv: ['ready'],
    expect: { code: 0, stdout: /^1 ready card\n {2}wi-0004 {2}Write docs\n1 option card excluded; use --json for reasons\.\n$/ },
  },
  {
    name: 'ready: --json gives the reasons, inside --parent',
    files: CLEAN,
    argv: ['ready', '--parent', 'Main', '--holder', 'sp-bot', '--json'],
    expect: { code: 0, stdout: /"reasons": \[\n\s+"dependency"\n\s+\]/ },
  },
  {
    name: 'ready: a card reference is a usage error',
    files: CLEAN,
    argv: ['ready', 'Main'],
    expect: { code: 2, stderr: /^wi: wi ready takes no card reference\.\n$/ },
  },
  {
    name: 'agents: an agent counts, a person does not',
    files: CLEAN,
    argv: ['agents'],
    expect: { code: 0, stdout: /^1 active, limit none\n {2}sp-bot\n {4}wi-0003 {2}Build server\n$/ },
  },
  {
    name: 'agents: --json',
    files: CLEAN,
    argv: ['agents', '--json'],
    expect: { code: 0, stdout: /"activeAgents": 1,\n\s+"maxAgents": null/ },
  },
  {
    name: 'validate: a clean vault',
    files: CLEAN,
    argv: ['validate'],
    expect: { code: 0, stdout: /^ok: 6 work items, 0 errors, 0 warnings\n$/ },
  },
  {
    name: 'validate: a vault with errors exits 1',
    files: SEED,
    argv: ['validate'],
    expect: { code: 1, stdout: /^error {2}Boards\/Build server\.md {2}\[date-missing\][\s\S]*warn {3}Boards\/Build server\.md {2}\[unknown-key\][\s\S]*\nFAILED: 5 work items, \d+ errors, 1 warnings\n$/ },
  },
  {
    name: 'validate: --json on a vault with errors exits 1',
    files: SEED,
    argv: ['validate', '--json'],
    expect: { code: 1, stdout: /^\{\n {2}"ok": false,\n {2}"items": 5,/ },
  },
]

/** A fixed clock and a fixed chance, so both runs stamp the same date and draw the same id. */
function seams(): VaultSeams {
  let n = 0
  return { now: () => new Date(2026, 9, 9, 10, 30), random: () => ((n++ * 0.618034) % 1) }
}

async function run(port: StoragePort, argv: string[]): Promise<Reply> {
  const line = parseCommandLine(argv)
  const context = createContext({ port, version: '0.0.0-contract', env: {}, seams: seams() })
  return runCommand(context, { command: line.positionals[0], positionals: line.positionals, values: line.values })
}

function snapshotDisk(root: string): Map<string, string> {
  const files = new Map<string, string>()
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    files.set(path.slice(root.length + 1).split(sep).join('/'), readFileSync(path, 'utf8'))
  }
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)))
}

function sorted(files: Map<string, string>): Map<string, string> {
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)))
}

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

for (const contract of CASES) {
  test(`contract: ${contract.name}`, async () => {
    fixture = makeVault()
    for (const [path, text] of Object.entries(contract.files)) fixture.write(path, text)
    const onNode = await run(nodePort(fixture.root), contract.argv)

    const fake = fakeObsidian(contract.files, FOLDERS)
    const onObsidian = await run(obsidianPort(fake), contract.argv)

    assert.deepEqual(onObsidian, onNode, 'the replies match')
    assert.deepEqual(sorted(fake.files), snapshotDisk(fixture.root), 'every file matches')

    assert.equal(onNode.code, contract.expect.code, onNode.stderr)
    if (contract.expect.stdout) assert.match(onNode.stdout, contract.expect.stdout)
    if (contract.expect.stderr) assert.match(onNode.stderr, contract.expect.stderr)
    for (const [path, pattern] of Object.entries(contract.expect.files ?? {})) {
      assert.match(readFileSync(join(fixture.root, path), 'utf8'), pattern, path)
    }
    if (onNode.code !== 0) assert.deepEqual(snapshotDisk(fixture.root), sorted(new Map(Object.entries(contract.files))), 'a refusal writes nothing')
  })
}

test('contract: every vault command has a case, or waits on NOT_YET', () => {
  const vaultCommands = Object.keys(COMMAND_FLAGS).filter((name) => !NOT_VAULT_COMMANDS.has(name))
  const covered = new Set(CASES.map((contract) => contract.argv[0]!))
  const missing = vaultCommands.filter((name) => !covered.has(name) && !NOT_YET.has(name))
  assert.deepEqual(missing, [], 'add a contract case for each, or put it on NOT_YET')
  const done = [...NOT_YET].filter((name) => covered.has(name))
  assert.deepEqual(done, [], 'a command with a case comes off NOT_YET')
  const stale = [...NOT_YET].filter((name) => !vaultCommands.includes(name))
  assert.deepEqual(stale, [], 'NOT_YET names only commands wi has')
  for (const name of covered) assert.ok(isRegistered(name), `${name} has a case, so it runs through runCommand`)
})
