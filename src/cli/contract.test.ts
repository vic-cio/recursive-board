/**
 * The contract between the two storage ports (docs/adr/0076-a-storage-port-and-a-command-runner.md).
 *
 * Each case runs one command line through runCommand twice: on the Node port over a temp vault,
 * and on the Obsidian port over an in-memory fake of the Obsidian API. The replies and every file
 * must match byte for byte. The coverage test fails when a command in the command table that
 * is not an install command has no case. The install commands (setup, doctor, update) differ on
 * purpose: wi works on the machine and the plugin only prints, so each side tests its own, and
 * src/plugin/cli-handler.test.ts checks that the plugin serves every command in the table.
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

import { parseCommandLine } from './flags.ts'
import { nodePort } from './node-port.ts'
import { makeVault, item, type Fixture } from './test-helpers.ts'
import { COMMANDS } from '../shared/command-table.ts'
import { createContext, isRegistered, runCommand, type Reply } from '../shared/runner.ts'
import type { StoragePort } from '../shared/storage.ts'
import type { VaultSeams } from '../shared/vault.ts'
import { FOLDERS } from '../shared/schema.ts'
import { obsidianPort } from '../plugin/obsidian-port.ts'
import { fakeObsidian } from '../plugin/fake-obsidian.ts'

interface ContractCase {
  name: string
  /** The vault before the run: every file's text by vault-relative path. */
  files: Record<string, string>
  /** The arguments after `wi`. */
  argv: string[]
  /** The environment the command reads, such as WI_AGENT. None when absent. */
  env?: Record<string, string>
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
    type: 'work-item', id: 'wi-0003', title: 'Build server', status: 'doing', parent: '"[[Launch]]"', assignee: 'sp-bot',
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
    type: 'work-item', id: 'wi-0006', title: 'Review copy', status: 'doing', parent: '"[[Launch]]"', assignee: 'Victor',
    created: '2026-09-01', updated: '2026-09-01',
  }),
  'People/Victor.md': item({ type: 'person' }),
  'Roles/Coder.md': item({ type: 'role', tags: '[role/coder]' }, '## Procedure\n'),
}

/** SEED with a person, a held card, a card that waits on Ana, a free card and an area. */
const EDIT_SEED: Record<string, string> = {
  ...SEED,
  'People/Ana.md': '---\ntype: person\n---\n',
  'Boards/Draft.md': item({ type: 'work-item', id: 'wi-0006', title: 'Draft', status: 'options', parent: '"[[Launch]]"' }, '## Notes\n'),
  'Boards/Held.md': item({ type: 'work-item', id: 'wi-0007', title: 'Held', status: 'doing', parent: '"[[Main]]"', holder: 'bot' }, '## Notes\n'),
  'Boards/In review.md': item({ type: 'work-item', id: 'wi-0008', title: 'In review', status: 'doing', parent: '"[[Main]]"', owner: 'Ana',
    depends_on: '["[[Ana]]"]' }, '## Notes\n'),
  'Boards/Ongoing.md': item({ type: 'work-item', id: 'wi-0009', title: 'Ongoing', parent: '"[[Main]]"', area: true }),
}

/** A signed writer, as an agent's session sets it. */
const AGENT = { WI_AGENT: 'sp-bot', WI_MODEL: 'model-1' }

/** The card edit commands (wi-0fko). */
const EDIT_CASES: ContractCase[] = [
  {
    name: 'note: the line is signed from WI_AGENT and WI_MODEL in the context env',
    files: EDIT_SEED, env: AGENT,
    argv: ['note', 'Build server', 'Priced 12 lines.'],
    expect: {
      code: 0, stdout: /^wi-0003 {2}Build server {2}- 2026-10-09 10:30, sp-bot \(model-1\): Priced 12 lines\.\n$/,
      files: { 'Boards/Build server.md': /Human prose\.\n- 2026-10-09 10:30, sp-bot \(model-1\): Priced 12 lines\.\n$/ },
    },
  },
  {
    name: 'note: --agent names the writer, --json',
    files: EDIT_SEED, env: AGENT,
    argv: ['note', 'wi-0006', 'Started.', '--agent', 'relay', '--json'],
    expect: { code: 0, stdout: /"line": "- 2026-10-09 10:30, relay \(model-1\): Started\."/ },
  },
  {
    name: 'note: no writer name is refused',
    files: EDIT_SEED,
    argv: ['note', 'Build server', 'Priced 12 lines.'],
    expect: { code: 2, stderr: /^wi: wi note needs a writer name\. Set WI_AGENT or pass --agent\.\n$/ },
  },
  {
    name: 'tag: adds a free tag',
    files: EDIT_SEED,
    argv: ['tag', 'Ship', 'design'],
    expect: { code: 0, stdout: /^wi-0005 {2}Ship {2}\+design\n$/, files: { 'Boards/Ship.md': /^tags:\n {2}- design$/m } },
  },
  {
    name: 'tag: --off on a tag the card lacks writes nothing',
    files: EDIT_SEED,
    argv: ['tag', 'Ship', 'design', '--off', '--json'],
    expect: { code: 0, stdout: /"changed": false/ },
  },
  {
    name: 'tag: an old area tag is refused',
    files: EDIT_SEED,
    argv: ['tag', 'Ship', 'area'],
    expect: { code: 2, stderr: /^wi: "area" is reserved for old area tags/ },
  },
  {
    name: 'area: a card becomes an area',
    files: EDIT_SEED,
    argv: ['area', 'Draft'],
    expect: { code: 0, stdout: /^wi-0006 {2}Draft {2}card → area/ },
  },
  {
    name: 'area: --off on an area with no status to restore is refused',
    files: EDIT_SEED,
    argv: ['area', 'Ongoing', '--off', '--json'],
    expect: { code: 2, stderr: /^wi: Boards\/Ongoing\.md has no valid status to preserve\.\n$/ },
  },
  {
    name: 'area: a root is refused',
    files: EDIT_SEED,
    argv: ['area', 'Main'],
    expect: { code: 2, stderr: /^wi: Boards\/Main\.md is a root, and a root is not a card or area child\.\n$/ },
  },
  {
    name: 'depend: a card waits on another',
    files: EDIT_SEED,
    argv: ['depend', 'Draft', '--on', 'Ship'],
    expect: { code: 0, stdout: /^wi-0006 {2}Draft {2}waits on Ship\n$/, files: { 'Boards/Draft.md': /^depends_on:\n {2}- "\[\[Ship\]\]"$/m } },
  },
  {
    name: 'depend: --off on a dependency the card lacks writes nothing, --json',
    files: EDIT_SEED,
    argv: ['depend', 'Draft', '--on', 'Ship', '--off', '--json'],
    expect: { code: 0, stdout: /"changed": false/ },
  },
  {
    name: 'depend: a loop is refused',
    files: EDIT_SEED,
    argv: ['depend', 'Build server', '--on', 'Ship'],
    expect: { code: 2, stderr: /^wi: Ship already waits on Build server/ },
  },
  {
    name: 'set: sets the owner',
    files: EDIT_SEED,
    argv: ['set', 'Ship', '--owner', 'Ana'],
    expect: { code: 0, stdout: /^wi-0005 {2}Ship {2}set owner\n$/, files: { 'Boards/Ship.md': /^owner: Ana$/m } },
  },
  {
    name: 'set: the owner already so writes nothing, --json',
    files: EDIT_SEED,
    argv: ['set', 'In review', '--owner', 'Ana', '--json'],
    expect: { code: 0, stdout: /"changed": \[\]/ },
  },
  {
    name: 'set: a named role is refused',
    files: EDIT_SEED,
    argv: ['set', 'Ship', '--role', 'coder'],
    expect: { code: 2, stderr: /^wi: a role is a tag now\. Run: wi tag Ship role\/coder\n$/ },
  },
  {
    name: 'claim: an agent claims by WI_AGENT from the context env',
    files: EDIT_SEED, env: AGENT,
    argv: ['claim', 'Draft'],
    expect: { code: 0, stdout: /^wi-0006 {2}Draft {2}options → doing {2}\(assignee: sp-bot\)\n$/, files: { 'Boards/Draft.md': /^assignee: sp-bot$/m } },
  },
  {
    name: 'claim: a claim beside a person names every assignee',
    files: { ...EDIT_SEED, 'Boards/Draft.md': item({ type: 'work-item', id: 'wi-0006', title: 'Draft', status: 'options', parent: '"[[Launch]]"', holder: '[Ana, agent]' }) },
    env: AGENT,
    argv: ['claim', 'Draft'],
    expect: { code: 0, stdout: /^wi-0006 {2}Draft {2}options → doing {2}\(assignees: Ana, sp-bot\)\n$/ },
  },
  {
    name: 'claim: WI_MAX_AGENTS from the context env warns after the claim, from the vault read again',
    files: EDIT_SEED, env: { WI_AGENT: 'sp-bot', WI_MAX_AGENTS: '1' },
    argv: ['claim', 'Draft', '--json'],
    expect: { code: 0, stdout: /"changed": true/, stderr: /^wi: warning: agent limit is 1; 2 agents now work a doing card\.\n$/ },
  },
  {
    name: 'claim: a card that waits on an open card is refused',
    files: EDIT_SEED,
    argv: ['claim', 'Ship', '--assignee', 'bot'],
    expect: { code: 2, stderr: /^wi: Boards\/Ship\.md waits on/ },
  },
  {
    name: 'claim: no assignee and no WI_AGENT is a usage error',
    files: EDIT_SEED,
    argv: ['claim', 'Draft'],
    expect: { code: 2, stderr: /^wi: wi claim needs --assignee <name>, or WI_AGENT set\.\n$/ },
  },
  {
    name: 'release: the hand-over note is signed from the context env',
    files: EDIT_SEED, env: AGENT,
    argv: ['release', 'Held', '--reason', 'Blocked on keys.', '--where', 'card/held'],
    expect: {
      code: 0, stdout: /^wi-0007 {2}Held {2}doing → options {2}\(released bot\)\n$/,
      files: { 'Boards/Held.md': /- 2026-10-09 10:30, sp-bot \(model-1\): Released from bot: Blocked on keys\. Work: card\/held\.\n$/ },
    },
  },
  {
    name: 'release: --holder names the one of several assignees to remove',
    files: { ...EDIT_SEED, 'Boards/Held.md': item({ type: 'work-item', id: 'wi-0007', title: 'Held', status: 'doing', parent: '"[[Main]]"', holder: '[bot, Ana]' }, '## Notes\n') },
    argv: ['release', 'Held', '--reason', 'Done with my part.', '--holder', 'bot'],
    expect: { code: 0, stdout: /^wi-0007 {2}Held {2}doing {2}\(released bot; assignees: Ana\)\n$/, files: { 'Boards/Held.md': /^assignee: Ana$/m } },
  },
  {
    name: 'release: a card with no assignee is refused',
    files: EDIT_SEED,
    argv: ['release', 'Draft', '--reason', 'Nothing to do.', '--json'],
    expect: { code: 2, stderr: /^wi: Boards\/Draft\.md has no assignee to release\.\n$/ },
  },
  {
    name: 'assign: to a person, with a role tag',
    files: EDIT_SEED,
    argv: ['assign', 'Draft', '--to', 'Ana', '--role', 'coder'],
    expect: { code: 0, stdout: /^wi-0006 {2}Draft {2}options {2}\(assigned to Ana\)\n$/, files: { 'Boards/Draft.md': /^assignee: Ana$[\s\S]*^tags:\n {2}- role\/coder$/m } },
  },
  {
    name: 'assign: to any agent, --json',
    files: EDIT_SEED,
    argv: ['assign', 'Draft', '--to', 'agent', '--json'],
    expect: { code: 0, stdout: /"assignees": \[\n {4}"agent"\n {2}\]/ },
  },
  {
    name: 'assign: a second assignee joins the first',
    files: EDIT_SEED,
    argv: ['assign', 'Held', '--to', 'Ana'],
    expect: { code: 0, stdout: /^wi-0007 {2}Held {2}doing {2}\(assigned to Ana; assignees: bot, Ana\)\n$/,
      files: { 'Boards/Held.md': /^assignee:\n {2}- bot\n {2}- Ana$/m } },
  },
  {
    name: 'assign: --off removes one assignee and keeps the status',
    files: EDIT_SEED,
    argv: ['assign', 'Held', '--to', 'bot', '--off'],
    expect: { code: 0, stdout: /^wi-0007 {2}Held {2}doing {2}\(unassigned bot; assignees: none\)\n$/,
      files: { 'Boards/Held.md': /^(?![\s\S]*^assignee:)(?![\s\S]*^holder:)[\s\S]*^status: doing$/m } },
  },
  {
    name: 'assign: a name with no person note is refused',
    files: EDIT_SEED,
    argv: ['assign', 'Draft', '--to', 'Nobody'],
    expect: { code: 2, stderr: /^wi: there is no person note called Nobody\./ },
  },
  {
    name: 'depend: a person is a wait like a card',
    files: EDIT_SEED,
    argv: ['depend', 'Held', '--on', 'Ana'],
    expect: { code: 0, stdout: /^wi-0007 {2}Held {2}waits on Ana\n$/, files: { 'Boards/Held.md': /^depends_on:\n {2}- "\[\[Ana\]\]"$/m } },
  },
  {
    name: 'depend: a name that is no card and no person is refused',
    files: EDIT_SEED,
    argv: ['depend', 'Held', '--on', 'Nobody'],
    expect: { code: 2, stderr: /^wi: no work item or person note matches "Nobody"/ },
  },
  {
    name: 'claim: a card that waits on a person is refused',
    files: EDIT_SEED,
    argv: ['claim', 'In review', '--assignee', 'sp-bot'],
    expect: { code: 2, stderr: /^wi: .*waits on Ana\./ },
  },
  {
    name: 'status: done clears the person wait',
    files: EDIT_SEED,
    argv: ['status', 'In review', 'done'],
    expect: { code: 0, files: { 'Boards/In review.md': /^(?![\s\S]*depends_on)[\s\S]*^status: done$/m } },
  },
  {
    name: 'archive: archives a done card',
    files: EDIT_SEED,
    argv: ['archive', 'Write docs'],
    expect: { code: 0, stdout: /^wi-0004 {2}Write docs {2}archived\n$/, files: { 'Boards/Write docs.md': /^archived: true$/m } },
  },
  {
    name: 'archive: --undo on a card that is not archived writes nothing, --json',
    files: EDIT_SEED,
    argv: ['archive', 'Write docs', '--undo', '--json'],
    expect: { code: 0, stdout: /"changed": false/ },
  },
  {
    name: 'archive: a board with a descendant in doing is refused',
    files: EDIT_SEED,
    argv: ['archive', 'Launch'],
    expect: { code: 2, stderr: /^wi: cannot archive Launch: descendant Build server \(wi-0003\) is doing\.\n$/ },
  },
  {
    name: 'promote: a card becomes a board',
    files: EDIT_SEED,
    argv: ['promote', 'Ship'],
    expect: { code: 0, stdout: /^wi-0005 {2}Ship {2}promoted\n$/, files: { 'Boards/Ship.md': /^board: true$/m } },
  },
  {
    name: 'promote: a board already so writes nothing, --json',
    files: EDIT_SEED,
    argv: ['promote', 'Launch', '--json'],
    expect: { code: 0, stdout: /"changed": false/ },
  },
  {
    name: 'promote: an area is refused',
    files: EDIT_SEED,
    argv: ['promote', 'Ongoing'],
    expect: { code: 2, stderr: /^wi: Boards\/Ongoing\.md is an area and cannot be promoted\.\n$/ },
  },
  {
    name: 'demote: a board becomes a card',
    files: EDIT_SEED,
    argv: ['demote', 'Launch'],
    expect: { code: 0, stdout: /^wi-0002 {2}Launch {2}demoted\n$/ },
  },
  {
    name: 'demote: an area is refused',
    files: EDIT_SEED,
    argv: ['demote', 'Ongoing', '--json'],
    expect: { code: 2, stderr: /^wi: Boards\/Ongoing\.md is an area and cannot be demoted\.\n$/ },
  },
]

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
    argv: ['ready', '--parent', 'Main', '--assignee', 'sp-bot', '--json'],
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
  ...EDIT_CASES,
  {
    name: 'new: a brief from flags',
    files: SEED,
    argv: ['new', 'Write tests', '--parent', 'Launch', '--objective', 'Cover the port', '--context', 'Use the fixtures',
      '--criteria', 'Both ports agree'],
    expect: {
      code: 0,
      stdout: /^wi-[0-9a-z]{4} {2}Boards\/Write tests\.md {2}\(child of Launch\)\n$/,
      files: { 'Boards/Write tests.md': /created: 2026-10-09[\s\S]*Cover the port[\s\S]*Use the fixtures[\s\S]*Both ports agree/ },
    },
  },
  {
    name: 'new: a first child promotes its parent to a board',
    files: SEED,
    argv: ['new', 'Pick a host', '--parent', 'Build server'],
    expect: {
      code: 0,
      stdout: /\nBuild server {2}promoted to a board \(its first child\)\n$/,
      stderr: /^wi: warning: wi-[0-9a-z]{4} has no /,
      files: { 'Boards/Build server.md': /^board: true$/m },
    },
  },
  {
    name: 'new: a filename clash takes the id suffix',
    files: SEED,
    argv: ['new', 'Ship', '--parent', 'Launch', '--json'],
    expect: { code: 0, stdout: /"path": "Boards\/Ship--[0-9a-z]{4}\.md"/, stderr: /wi: note: another item has this filename/ },
  },
  {
    name: 'new: a missing title is a usage error',
    files: SEED,
    argv: ['new', '--parent', 'Launch'],
    expect: { code: 2, stderr: /^wi: wi new needs a title/ },
  },
  {
    name: 'move: a card moves to another parent',
    files: SEED,
    argv: ['move', 'Ship', '--to', 'Launch'],
    expect: { code: 0, stdout: /^wi-0005 {2}Ship {2}Main → Launch\n$/, files: { 'Boards/Ship.md': /^parent: "\[\[Launch\]\]"$/m } },
  },
  {
    name: 'move: a move that would make a loop is refused',
    files: SEED,
    argv: ['move', 'Launch', '--to', 'Build server'],
    expect: { code: 2, stderr: /^wi: cannot move Launch under Build server: / },
  },
  {
    name: 'rm: --recursive moves the card and its children to the trash',
    files: SEED,
    argv: ['rm', 'Launch', '--recursive'],
    expect: { code: 0, stdout: /removed {2}wi-0002 {2}Boards\/Launch\.md -> \.trash\/Launch\.md\n3 work items\n$/, files: { '.trash/Launch.md': /title: Launch/ } },
  },
  {
    name: 'rm: --dry-run names what would go and writes nothing',
    files: SEED,
    argv: ['rm', 'Launch', '--recursive', '--dry-run', '--json'],
    expect: { code: 0, stdout: /"dryRun": true[\s\S]*"to": "\.trash\/Launch\.md"/ },
  },
  {
    name: 'rm: a taken trash name gets a number',
    files: { ...SEED, '.trash/Ship.md': '# An older Ship\n' },
    argv: ['rm', 'Ship'],
    expect: { code: 0, stdout: /-> \.trash\/Ship 1\.md\n1 work item\n$/, files: { '.trash/Ship.md': /^# An older Ship\n$/ } },
  },
  {
    name: 'rm: a parent without --recursive is refused',
    files: SEED,
    argv: ['rm', 'Launch'],
    expect: { code: 2, stderr: /^wi: Launch has 2 children: / },
  },
  ...['trace', 'here', 'template', 'objective', 'dashboard', 'retag', 'graph', 'review', 'approve', 'send-back', 'delegate'].map((command): ContractCase => ({
    name: `${command}: retired, it names the new way and exits 0`,
    files: SEED,
    argv: [command],
    expect: { code: 0, stdout: new RegExp(`^wi [a-z ]*\\b${command}\\b[a-z ]*(is retired|was removed|were removed)`) },
  })),
]

/** A fixed clock and a fixed chance, so both runs stamp the same date and draw the same id. */
function seams(): VaultSeams {
  let n = 0
  return { now: () => new Date(2026, 9, 9, 10, 30), random: () => ((n++ * 0.618034) % 1) }
}

async function run(port: StoragePort, argv: string[], env: Record<string, string> = {}): Promise<Reply> {
  const line = parseCommandLine(argv)
  const context = createContext({ port, version: '0.0.0-contract', env, seams: seams() })
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
    const onNode = await run(nodePort(fixture.root), contract.argv, contract.env)

    const fake = fakeObsidian(contract.files, FOLDERS)
    const onObsidian = await run(obsidianPort(fake), contract.argv, contract.env)

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

test('contract: every vault and retired command in the command table has a case on both ports', () => {
  const vaultCommands = COMMANDS.filter((command) => command.kind !== 'install').map((command) => command.name)
  const covered = new Set(CASES.map((contract) => contract.argv[0]!))
  const missing = vaultCommands.filter((name) => !covered.has(name))
  assert.deepEqual(missing, [], 'add a contract case for each')
  for (const name of covered) assert.ok(isRegistered(name), `${name} has a case, so it runs through runCommand`)
})
