import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { firstBoardPlan, mergeDefaultRoot } from './first-board.ts'
import { loadVault } from '../cli/vault.ts'
import { validate } from '../cli/commands/validate.ts'
import { makeVault, type Fixture } from '../cli/test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

test('first board plan creates valid root and example child files', async () => {
  fixture = makeVault()
  const plan = firstBoardPlan({
    title: 'Main', configText: null, takenIds: new Set(), takenStems: new Set(),
    now: new Date(2026, 8, 24), random: () => 0,
  })
  for (const file of plan.files) fixture.write(`Boards/${file.path}`, file.text)
  fixture.write('.wi.json', plan.configText)

  const result = await validate(await loadVault(fixture.root))
  assert.equal(result.errorCount, 0)
  assert.equal(result.warningCount, 0)
  assert.equal(result.itemCount, 2)
  const child = readFileSync(join(fixture.root, 'Boards', plan.files[1]!.path), 'utf8')
  assert.match(child, /Move to…/)
})

test('config merge sets defaultRoot and preserves existing keys', () => {
  assert.deepEqual(JSON.parse(mergeDefaultRoot('{"workItemFolder":"Projects","custom":true}', 'Main')),
    { workItemFolder: 'Projects', custom: true, defaultRoot: 'Main' })
})

test('config merge rejects malformed config before a board is written', () => {
  assert.throws(() => mergeDefaultRoot('{broken', 'Main'), /valid JSON/)
  assert.throws(() => mergeDefaultRoot('[]', 'Main'), /JSON object/)
})
