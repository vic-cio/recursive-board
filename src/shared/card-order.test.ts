import { test } from 'node:test'
import assert from 'node:assert/strict'

import { keyBetween, keysBetween } from './card-order.ts'

function assertBetween(lower: string | null, key: string, upper: string | null): void {
  if (lower !== null) assert.ok(lower < key, `${lower} < ${key}`)
  if (upper !== null) assert.ok(key < upper, `${key} < ${upper}`)
}

test('keyBetween creates keys at both ends and inside a gap', () => {
  const middle = keyBetween(null, null)
  const before = keyBetween(null, middle)
  const after = keyBetween(middle, null)
  assertBetween(before, middle, after)
  assertBetween(middle, keyBetween(middle, after), after)
  assertBetween(before, keyBetween(before, middle), middle)
})

test('keyBetween can repeatedly divide a narrow gap in either direction', () => {
  const start = keyBetween(null, null)
  const end = keyBetween(start, null)
  let upper = end
  for (let i = 0; i < 500; i++) {
    const next = keyBetween(start, upper)
    assertBetween(start, next, upper)
    upper = next
  }
  let lower = start
  for (let i = 0; i < 500; i++) {
    const next = keyBetween(lower, end)
    assertBetween(lower, next, end)
    lower = next
  }
})

test('keysBetween generates the requested count in strict order', () => {
  for (const [lower, upper] of [
    [null, null],
    [null, keyBetween(null, null)],
    [keyBetween(null, null), null],
    [keyBetween(null, null), keyBetween(keyBetween(null, null), null)],
  ] satisfies [string | null, string | null][]) {
    for (const count of [0, 1, 2, 31, 100]) {
      const keys = keysBetween(lower, upper, count)
      assert.equal(keys.length, count)
      let previous = lower
      for (const key of keys) {
        assertBetween(previous, key, upper)
        previous = key
      }
    }
  }
})

test('10,000 inserts at the front keep keys short', () => {
  let first: string | null = null
  for (let i = 0; i < 10_000; i++) {
    const next = keyBetween(null, first)
    assertBetween(null, next, first)
    first = next
  }
  assert.ok(first !== null && first.length <= 12, `front key: ${first}`)
})

test('mixed inserts remain sortable across integer and fractional boundaries', () => {
  const keys = keysBetween(null, null, 100)
  let seed = 17
  for (let i = 0; i < 2_000; i++) {
    seed = (seed * 48_271) % 2_147_483_647
    const slot = seed % (keys.length + 1)
    const lower = keys[slot - 1] ?? null
    const upper = keys[slot] ?? null
    const key = keyBetween(lower, upper)
    assertBetween(lower, key, upper)
    keys.splice(slot, 0, key)
  }
  assert.equal(new Set(keys).size, keys.length)
  assert.deepEqual([...keys].sort(), keys)
})

test('invalid, duplicate, and reversed bounds fail clearly', () => {
  assert.throws(() => keyBetween('bad key', null), /Invalid card order key/)
  const key = keyBetween(null, null)
  assert.throws(() => keyBetween(key, key), /lower than/)
  assert.throws(() => keyBetween(keyBetween(key, null), key), /lower than/)
  assert.throws(() => keysBetween(null, null, -1), /non-negative integer/)
})
