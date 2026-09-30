import assert from 'node:assert/strict'
import test from 'node:test'

import { renameThenSave } from './rename-transaction.ts'

test('folder rename rolls back when the matching settings save fails', async () => {
  let folder = 'Boards'
  await assert.rejects(renameThenSave(
    async (path) => { folder = path },
    'Boards',
    'Projects',
    async () => { throw new Error('disk full') },
  ), /disk full/)
  assert.equal(folder, 'Boards')
})

test('folder rename stays when the matching settings save succeeds', async () => {
  let folder = 'Boards'
  await renameThenSave(async (path) => { folder = path }, 'Boards', 'Projects', async () => {})
  assert.equal(folder, 'Projects')
})
