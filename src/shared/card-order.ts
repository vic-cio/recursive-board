/**
 * Sparse, lexically sortable card positions. This module has no vault or Node dependency.
 *
 * Each key has a signed integer anchor and an optional base-62 fraction after `_`.
 * Integer anchors let inserts at either end advance without lengthening a fraction.
 * Between adjacent anchors, a fraction can always be extended without rewriting a neighbor.
 * Compare keys with `<` and `>`, never localeCompare (which can reorder case).
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = BigInt(DIGITS.length)

interface Position {
  anchor: bigint
  fraction: string
}

function encodeDigits(value: bigint): string {
  if (value === 0n) return '0'
  let remaining = value
  let result = ''
  while (remaining > 0n) {
    result = DIGITS.charAt(Number(remaining % BASE)) + result
    remaining /= BASE
  }
  return result
}

function encodeAnchor(value: bigint): string {
  if (value >= 0n) {
    const digits = encodeDigits(value)
    return `p${'z'.repeat(digits.length)}0${digits}`
  }
  const digits = encodeDigits(-value)
  const reversed = [...digits].map((digit) => DIGITS.charAt(DIGITS.length - 1 - DIGITS.indexOf(digit))).join('')
  return `n${'0'.repeat(digits.length)}z${reversed}`
}

function parseKey(key: string): Position {
  const parts = key.split('_')
  const base = parts[0] ?? ''
  const fraction = parts[1] ?? ''
  const match = /^(n0+z|pz+0)([0-9A-Za-z]+)$/.exec(base)
  const head = match?.[1]
  const encoded = match?.[2]
  if (parts.length > 2 || head === undefined || encoded === undefined || encoded.length !== head.length - 2 ||
      (parts.length === 2 && (fraction === '' || fraction.endsWith('0') ||
        [...fraction].some((digit) => !DIGITS.includes(digit))))) {
    throw new Error(`Invalid card order key: ${key}`)
  }
  const digits = head[0] === 'n'
    ? [...encoded].map((digit) => DIGITS.charAt(DIGITS.length - 1 - DIGITS.indexOf(digit))).join('')
    : encoded
  let magnitude = 0n
  for (const digit of digits) magnitude = magnitude * BASE + BigInt(DIGITS.indexOf(digit))
  const anchor = head[0] === 'n' ? -magnitude : magnitude
  if (encodeAnchor(anchor) !== base) throw new Error(`Invalid card order key: ${key}`)
  return { anchor, fraction }
}

function fractionBetween(lower: string, upper: string | null): string {
  let prefix = ''
  let index = 0
  while (true) {
    const low = index < lower.length ? DIGITS.indexOf(lower.charAt(index)) : 0
    const high = upper === null || index >= upper.length ? DIGITS.length : DIGITS.indexOf(upper.charAt(index))
    if (low === high) {
      prefix += DIGITS.charAt(low)
      index++
    } else if (high - low > 1) {
      return prefix + DIGITS.charAt(Math.floor((low + high) / 2))
    } else {
      // The lower digit has room for an extension before the higher digit.
      return prefix + DIGITS.charAt(low) + fractionBetween(lower.slice(index + 1), null)
    }
  }
}

/** A key strictly between two existing keys; null means the unbounded end. */
export function keyBetween(lower: string | null, upper: string | null): string {
  const a = lower === null ? null : parseKey(lower)
  const b = upper === null ? null : parseKey(upper)
  if (lower !== null && upper !== null && lower >= upper) {
    throw new Error('The lower card order key must be lower than the upper key.')
  }
  if (a === null) return encodeAnchor(b === null ? 0n : b.anchor - 1n)
  if (b === null) return encodeAnchor(a.anchor + 1n)
  if (a.anchor < b.anchor) {
    const distance = b.anchor - a.anchor
    if (distance > 1n) return encodeAnchor(a.anchor + distance / 2n)
    return `${encodeAnchor(a.anchor)}_${fractionBetween(a.fraction, null)}`
  }
  return `${encodeAnchor(a.anchor)}_${fractionBetween(a.fraction, b.fraction)}`
}

/** Generate several keys in order, spreading them across the available gap. */
export function keysBetween(lower: string | null, upper: string | null, count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Card order key count must be a non-negative integer.')
  }
  // Validate bounds even when count is zero.
  if (lower !== null) parseKey(lower)
  if (upper !== null) parseKey(upper)
  if (lower !== null && upper !== null && lower >= upper) {
    throw new Error('The lower card order key must be lower than the upper key.')
  }
  const result: string[] = []
  function fill(a: string | null, b: string | null, n: number): void {
    if (n === 0) return
    const left = Math.floor(n / 2)
    const pivot = keyBetween(a, b)
    fill(a, pivot, left)
    result.push(pivot)
    fill(pivot, b, n - left - 1)
  }
  fill(lower, upper, count)
  return result
}
