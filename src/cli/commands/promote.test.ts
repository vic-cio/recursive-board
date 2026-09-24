import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { setPromoted } from './promote.ts'
import { loadVault } from '../vault.ts'
import { parseFrontmatter } from '../../shared/frontmatter.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => { fixture?.cleanup(); fixture = undefined })

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('../wi.ts', import.meta.url))

function seed(board?: boolean): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  f.write('Boards/Plan.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Plan', status: 'doing',
    parent: '"[[Main]]"', owner: 'human', mystery_key: 'keep me',
    ...(board === undefined ? {} : { board }),
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Plan\n\nKeep this body.\n'))
  return f
}

function seedArea(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  f.write('Boards/Operations.md', item({
    type: 'work-item', id: 'wi-0002', title: 'Operations', area: true,
    parent: '"[[Main]]"', created: '2026-09-21', updated: '2026-09-21',
  }, '# Operations\n\nOngoing work.\n'))
  return f
}

const content = (f: Fixture) => readFileSync(join(f.root, 'Boards/Plan.md'), 'utf8')
const frontmatter = (f: Fixture) => parseFrontmatter(content(f))!

test('promote sets board and stamps updated while preserving other keys and body', async () => {
  fixture = seed()
  const result = await setPromoted(await loadVault(fixture.root), 'Plan', true)
  assert.equal(result.promoted, true)
  assert.equal(result.changed, true)
  assert.equal(frontmatter(fixture).get('board'), true)
  assert.notEqual(frontmatter(fixture).get('updated'), '2026-09-21')
  assert.equal(frontmatter(fixture).get('owner'), 'human')
  assert.equal(frontmatter(fixture).get('mystery_key'), 'keep me')
  assert.ok(content(fixture).endsWith('# Plan\n\nKeep this body.\n'))
})

test('promote is idempotent and does not rewrite an already promoted item', async () => {
  fixture = seed(true)
  const before = content(fixture)
  const result = await setPromoted(await loadVault(fixture.root), 'Plan', true)
  assert.equal(result.changed, false)
  assert.equal(content(fixture), before)
})

test('demote removes board and stamps updated while preserving other keys and body', async () => {
  fixture = seed(true)
  const result = await setPromoted(await loadVault(fixture.root), 'Plan', false)
  assert.equal(result.promoted, false)
  assert.equal(result.changed, true)
  assert.equal(frontmatter(fixture).has('board'), false)
  assert.notEqual(frontmatter(fixture).get('updated'), '2026-09-21')
  assert.equal(frontmatter(fixture).get('owner'), 'human')
  assert.equal(frontmatter(fixture).get('mystery_key'), 'keep me')
  assert.ok(content(fixture).endsWith('# Plan\n\nKeep this body.\n'))
})

test('demote is idempotent and does not rewrite an item without board', async () => {
  fixture = seed()
  const before = content(fixture)
  const result = await setPromoted(await loadVault(fixture.root), 'Plan', false)
  assert.equal(result.changed, false)
  assert.equal(content(fixture), before)
})

test('promote refuses an area without rewriting it', async () => {
  fixture = seedArea()
  const before = readFileSync(join(fixture.root, 'Boards/Operations.md'), 'utf8')
  await assert.rejects(
    setPromoted(await loadVault(fixture.root), 'Operations', true),
    /area.*cannot be promoted/i,
  )
  assert.equal(readFileSync(join(fixture.root, 'Boards/Operations.md'), 'utf8'), before)
})

test('demote refuses an area without rewriting it', async () => {
  fixture = seedArea()
  const before = readFileSync(join(fixture.root, 'Boards/Operations.md'), 'utf8')
  await assert.rejects(
    setPromoted(await loadVault(fixture.root), 'Operations', false),
    /area.*cannot be demoted/i,
  )
  assert.equal(readFileSync(join(fixture.root, 'Boards/Operations.md'), 'utf8'), before)
})

test('wi promote and demote refuse an area with exit code 2', async () => {
  fixture = seedArea()
  for (const command of ['promote', 'demote']) {
    let error: { code?: number; stderr?: string }
    try {
      await run('node', [CLI, command, 'Operations'], {
        env: { ...process.env, WI_VAULT: fixture.root },
      })
      assert.fail(`wi ${command} should refuse an area`)
    } catch (caught) {
      error = caught as { code?: number; stderr?: string }
    }
    assert.equal(error!.code, 2)
    assert.match(error!.stderr ?? '', /Operations\.md is an area and cannot be/i)
  }
})
