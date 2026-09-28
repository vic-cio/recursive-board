import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeTicks, parseDeviceDashboardState, parsePersonTicks, safePersonFileName, splitLegacyDashboardState } from './personal-state.ts'

test('device dashboard state has safe defaults and parses only known values', () => {
  assert.deepEqual(parseDeviceDashboardState({ you: ' Ana ', root: 'Boards/Main.md', focus: null, webReviewMode: 'off', ticks: { a: true } }), {
    you: ' Ana ', root: 'Boards/Main.md', focus: null, webReviewMode: 'off',
  })
  assert.deepEqual(parseDeviceDashboardState({ you: 4, root: null, focus: 2, webReviewMode: 'unknown' }), {
    you: '', root: '', focus: null, webReviewMode: 'webviewer',
  })
})

test('legacy state splits into device choices and person ticks, with device values taking precedence', () => {
  assert.deepEqual(splitLegacyDashboardState(
    { you: 'Old name', root: 'old-root', focus: 'old-focus', webReviewMode: 'browser', ticks: { a: true, b: true } },
    { you: 'New name', root: '', focus: null, webReviewMode: 'off' },
  ), {
    device: { you: 'New name', root: '', focus: null, webReviewMode: 'off' },
    personName: 'New name',
    ticks: { a: true, b: true },
  })
})

test('invalid device values fall back to valid legacy choices', () => {
  assert.deepEqual(splitLegacyDashboardState(
    { you: 'Ana', root: 'Main', focus: 'Area', webReviewMode: 'browser' },
    { you: 2, root: null, focus: 5, webReviewMode: 'bad' },
  ).device, { you: 'Ana', root: 'Main', focus: 'Area', webReviewMode: 'browser' })
})

test('person tick files parse and merge true ticks without dropping synced ticks', () => {
  assert.deepEqual(parsePersonTicks('{"ticks":{"a":true,"b":false,"c":1}}'), { a: true })
  assert.deepEqual(mergeTicks({ a: true, b: true }, { a: true, c: true }), { a: true, b: true, c: true })
})

test('person names become one safe path segment', () => {
  assert.equal(safePersonFileName('../Ana/Notes'), '%2E%2E%2FAna%2FNotes')
  assert.equal(safePersonFileName(''), null)
})
