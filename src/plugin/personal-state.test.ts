import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTickChanges, mergeTicks, parseDeviceDashboardState, parsePersonTicks, personTicks, safePersonFileName, splitLegacyDashboardState, withPersonTicks } from './personal-state.ts'

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

test('personTicks reads one person\'s ticks from plugin data', () => {
  const data = { statusColors: {}, people: { Ana: { ticks: { 'a.md': true, 'b.md': false } }, Sam: { ticks: { 'c.md': true } } } }
  assert.deepEqual(personTicks(data, 'Ana'), { 'a.md': true })
  assert.deepEqual(personTicks(data, 'Nobody'), {})
  assert.deepEqual(personTicks({ people: 'broken' }, 'Ana'), {})
})

test('withPersonTicks changes only that person, and drops an empty entry', () => {
  const data = { statusColors: { doing: '#fff' }, people: { Ana: { ticks: { 'a.md': true } }, Sam: { ticks: { 'c.md': true } } } }
  assert.deepEqual(withPersonTicks(data, 'Ana', { 'b.md': true }), {
    statusColors: { doing: '#fff' }, people: { Ana: { ticks: { 'b.md': true } }, Sam: { ticks: { 'c.md': true } } },
  })
  assert.deepEqual(withPersonTicks(data, 'Ana', {}), { statusColors: { doing: '#fff' }, people: { Sam: { ticks: { 'c.md': true } } } })
  assert.deepEqual(withPersonTicks({}, 'Sam', {}), {})
})

test('applyTickChanges keeps ticks made elsewhere and applies only what changed here', () => {
  const stored = { 'phone.md': true as const, 'both.md': true as const }
  const before = { 'both.md': true as const, 'mac.md': true as const }
  const after = { 'mac.md': true as const, 'new.md': true as const }
  assert.deepEqual(applyTickChanges(stored, before, after), { 'phone.md': true, 'new.md': true })
})
