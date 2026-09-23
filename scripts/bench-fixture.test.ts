import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadVault } from '../src/cli/vault.ts'
import { validate } from '../src/cli/commands/validate.ts'
import { BENCH_ROOT, writeBenchFixture } from './bench-fixture.ts'

test('benchmark fixture is a valid, branched vault with the requested number of cards', async () => {
  const root = await mkdtemp(join(tmpdir(), 'recursive-board-bench-test-'))
  try {
    await writeBenchFixture(root, 100)
    const vault = await loadVault(root)
    const report = await validate(vault)
    assert.equal(report.itemCount, 101)
    assert.deepEqual(report.problems, [])
    assert.ok(vault.childrenOf(vault.resolve(BENCH_ROOT)).length > 50)
    assert.ok(vault.items.some((item) => item.parent === 'Card 00007'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
