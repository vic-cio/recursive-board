import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('../wi.ts', import.meta.url))

test('wi objective exits successfully and points to wi show', async () => {
  const { stdout, stderr } = await run('node', [CLI, 'objective'])
  assert.equal(stderr, '')
  assert.match(stdout, /wi objective is retired/i)
  assert.match(stdout, /wi show <ref> --json/)
})
