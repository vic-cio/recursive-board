import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  newerRulesWarning, readRulesMarker, RULES_MARKER_KEY, RULES_VERSION, rulesMarkerIn, versionLine,
  withRaisedRulesMarker,
} from './rules-version.ts'
import { createContext, runCommand, RUNNERS, type RunFunction } from './runner.ts'
import { PLUGIN_DATA_FILE } from './board-settings.ts'
import { nodePort } from '../cli/node-port.ts'
import { makeVault, item, type Fixture } from '../cli/test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(pluginData?: string): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-09-21', updated: '2026-09-21' }, '# Main\n'))
  f.write('Boards/Task.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Task', status: 'options', parent: '"[[Main]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Task\n'))
  if (pluginData !== undefined) f.write(PLUGIN_DATA_FILE, pluginData)
  return f
}

const marker = (version: number) => JSON.stringify({ [RULES_MARKER_KEY]: version })

async function run(f: Fixture, command: string, positionals: string[]) {
  const context = createContext({ port: nodePort(f.root), version: '0.0.0' })
  return runCommand(context, { command, positionals: [command, ...positionals], values: {} })
}

test('the rules version is a whole number above 0', () => {
  assert.ok(Number.isInteger(RULES_VERSION) && RULES_VERSION > 0)
})

test('the version line starts with the package version', () => {
  assert.equal(versionLine('1.2.3', 4), '1.2.3 (rules 4)')
  assert.equal(versionLine('1.2.3').split(' ')[0], '1.2.3')
})

test('rulesMarkerIn reads a whole number and ignores anything else', () => {
  assert.equal(rulesMarkerIn({ rulesVersion: 3 }), 3)
  assert.equal(rulesMarkerIn({}), null)
  assert.equal(rulesMarkerIn(null), null)
  assert.equal(rulesMarkerIn({ rulesVersion: '3' }), null)
  assert.equal(rulesMarkerIn({ rulesVersion: 1.5 }), null)
  assert.equal(rulesMarkerIn({ rulesVersion: 0 }), null)
})

test('withRaisedRulesMarker raises an older or missing marker and keeps every other key', () => {
  assert.deepEqual(withRaisedRulesMarker({ board: { maxAgents: 2 } }, 2), { board: { maxAgents: 2 }, rulesVersion: 2 })
  assert.deepEqual(withRaisedRulesMarker({ rulesVersion: 1, x: true }, 2), { rulesVersion: 2, x: true })
})

test('withRaisedRulesMarker never lowers the marker, and creates no plugin data', () => {
  assert.equal(withRaisedRulesMarker({ rulesVersion: 2 }, 2), null)
  assert.equal(withRaisedRulesMarker({ rulesVersion: 3 }, 2), null)
  assert.equal(withRaisedRulesMarker(null, 2), null)
})

test('newerRulesWarning warns only for a newer marker', () => {
  assert.match(newerRulesWarning(3, 2) ?? '', /rules version 3.*rules version 2/)
  assert.equal(newerRulesWarning(2, 2), null)
  assert.equal(newerRulesWarning(1, 2), null)
  assert.equal(newerRulesWarning(null, 2), null)
})

test('readRulesMarker reads the plugin data through the port', async () => {
  fixture = seed(marker(5))
  assert.equal(await readRulesMarker(nodePort(fixture.root)), 5)
})

test('readRulesMarker gives null for missing or broken plugin data', async () => {
  fixture = seed()
  assert.equal(await readRulesMarker(nodePort(fixture.root)), null)
  fixture.write(PLUGIN_DATA_FILE, '{not json')
  assert.equal(await readRulesMarker(nodePort(fixture.root)), null)
})

test('a write command warns on stderr when the marker is newer, and still writes', async () => {
  fixture = seed(marker(RULES_VERSION + 1))
  const reply = await run(fixture, 'status', ['wi-0002', 'doing'])
  assert.equal(reply.code, 0)
  assert.match(reply.stderr, new RegExp(`^wi: warning: .*rules version ${RULES_VERSION + 1}.*rules version ${RULES_VERSION}\\b`))
  assert.match(reply.stdout, /options → doing/)
})

test('a write command does not warn when the marker is equal, older or missing', async () => {
  for (const data of [marker(RULES_VERSION), marker(RULES_VERSION - 1), '{}', undefined]) {
    fixture?.cleanup()
    fixture = seed(data)
    const reply = await run(fixture, 'status', ['wi-0002', 'doing'])
    assert.equal(reply.code, 0, reply.stderr)
    assert.equal(reply.stderr, '', `plugin data ${data}`)
  }
})

test('a read command does not warn when the marker is newer', async () => {
  fixture = seed(marker(RULES_VERSION + 1))
  // A read command from the table, registered for this test only: the read commands move into
  // the runner on their own card.
  const registry = RUNNERS as Record<string, RunFunction>
  const had = Object.hasOwn(registry, 'validate')
  const before = registry['validate']
  if (!had) registry['validate'] = async () => 0
  try {
    const reply = await run(fixture, 'validate', [])
    assert.equal(reply.stderr.includes('warning'), false, reply.stderr)
  } finally {
    if (had) registry['validate'] = before!
    else delete registry['validate']
  }
})
