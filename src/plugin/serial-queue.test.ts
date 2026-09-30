import assert from 'node:assert/strict'
import test from 'node:test'

import { SerialQueue } from './serial-queue.ts'

test('serial queue runs concurrent settings patches in order', async () => {
  const queue = new SerialQueue()
  const saved: string[] = []
  let releaseFirst!: () => void
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
  const first = queue.run(async () => {
    await firstGate
    saved.push('folder')
  })
  const second = queue.run(async () => { saved.push('root') })
  await Promise.resolve()
  assert.deepEqual(saved, [])
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(saved, ['folder', 'root'])
})

test('serial queue runs later saves after one save fails', async () => {
  const queue = new SerialQueue()
  const later = queue.run(async () => { throw new Error('save failed') })
  await assert.rejects(later, /save failed/)
  let saved = false
  await queue.run(async () => { saved = true })
  assert.equal(saved, true)
})
