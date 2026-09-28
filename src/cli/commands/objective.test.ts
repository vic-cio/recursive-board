import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { makeVault, item, type Fixture } from '../test-helpers.ts'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('../wi.ts', import.meta.url))

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

async function wi(args: string[], env: NodeJS.ProcessEnv = {}) {
  try {
    const { stdout, stderr } = await run('node', [CLI, ...args], {
      env: { ...process.env, WI_VAULT: fixture!.root, ...env },
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string }
    return { code: result.code ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  }
}

test('wi objective prints the selected card and every ancestor objective', async () => {
  fixture = seed()
  const result = await wi(['objective', 'wi-0003'])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout,
    'Objective chain (current card to root):\n' +
    '1. Ship feature (wi-0003)\n   Finish the feature.\n' +
    '2. Build product (wi-0002)\n   Deliver the product.\n' +
    '3. Main (wi-0001)\n   Run the project.\n')
})

test('wi objective marks a missing objective with a clear placeholder', async () => {
  fixture = seed()
  fixture.write('Boards/Build product.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Build product', status: 'doing', parent: '"[[Main]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  const result = await wi(['objective', 'wi-0002'])
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /Build product[\s\S]*\[Objective missing\]/)
})

test('wi objective reports a missing parent and does not guess the chain', async () => {
  fixture = seed()
  fixture.write('Boards/Build product.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Build product', status: 'doing', parent: '"[[No such parent]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, '## Objective\n\nDeliver the product.\n'))
  const result = await wi(['objective', 'wi-0002'])
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /Deliver the product/)
  assert.match(result.stdout, /Chain stopped: parent "No such parent" is missing\./)
  assert.doesNotMatch(result.stdout, /Main \(wi-0001\)/)
})

test('wi objective reports cycles without repeating a card', async () => {
  fixture = seed()
  fixture.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main', parent: '"[[Ship feature]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, '## Objective\n\nRun the project.\n'))
  const result = await wi(['objective', 'wi-0003'])
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /Chain stopped: cycle at Ship feature\./)
  assert.equal((result.stdout.match(/Ship feature \(wi-0003\)/g) ?? []).length, 1)
})

test('WI_CARD takes priority over WI_AGENT', async () => {
  fixture = seed()
  fixture.write('Boards/Other.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Other', status: 'doing', agent: 'codex', parent: '"[[Main]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, '## Objective\n\nDo other work.\n'))
  const result = await wi(['objective'], { WI_CARD: 'wi-0003', WI_AGENT: 'codex' })
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /Ship feature/)
  assert.doesNotMatch(result.stdout, /Other \(wi-0004\)/)
})

test('WI_AGENT selects the unique deepest doing claim', async () => {
  fixture = seed()
  fixture.write('Boards/Other.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Other', status: 'doing', agent: 'codex', parent: '"[[Main]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, '## Objective\n\nDo other work.\n'))
  const result = await wi(['objective'], { WI_AGENT: 'codex' })
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /Ship feature/)
  assert.doesNotMatch(result.stdout, /Other \(wi-0004\)/)
})

test('WI_AGENT stays silent when deepest claims are ambiguous', async () => {
  fixture = seed()
  fixture.write('Boards/Other.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Other', status: 'doing', agent: 'codex', parent: '"[[Build product]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, '## Objective\n\nDo other work.\n'))
  const result = await wi(['objective'], { WI_AGENT: 'codex' })
  // Two doing claims at the same deepest level are ambiguous.
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout, '')
})

test('wi objective bounds the number and size of objectives', async () => {
  fixture = seed()
  fixture.write('Boards/Ship feature.md', item({
    type: 'work-item', id: 'wi-0003', title: 'Ship feature', status: 'doing', parent: '"[[Build product]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, `## Objective\n\n${'x'.repeat(2000)}\n`))
  const result = await wi(['objective', 'wi-0003'])
  assert.equal(result.code, 0, result.stderr)
  assert.ok(result.stdout.length <= 5000, `output was ${result.stdout.length} characters`)
  assert.match(result.stdout, /truncated/i)
})

function seed(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main', created: '2026-09-21', updated: '2026-09-21',
  }, '## Objective\n\nRun the project.\n'))
  f.write('Boards/Build product.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Build product', status: 'doing', parent: '"[[Main]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, '## Objective\n\nDeliver the product.\n'))
  f.write('Boards/Ship feature.md', item({
    type: 'work-item', id: 'wi-0003', title: 'Ship feature', status: 'doing', agent: 'codex', parent: '"[[Build product]]"',
    created: '2026-09-21', updated: '2026-09-21',
  }, '## Objective\n\nFinish the feature.\n'))
  return f
}
