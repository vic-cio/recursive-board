import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTickChanges, mergeTicks, parseDeviceDashboardState, parsePersonTicks, personTicks, safePersonFileName, splitLegacyDashboardState, withFold, withPersonTicks } from './personal-state.ts'

test('device dashboard state has safe defaults and parses only known values', () => {
  assert.deepEqual(parseDeviceDashboardState({ you: ' Ana ', root: 'Boards/Main.md', focus: null, webReviewMode: 'off', ticks: { a: true } }), {
    you: ' Ana ', root: 'Boards/Main.md', focus: null, webReviewMode: 'off', finishedOpen: false, foldedGroups: [],
  })
  assert.deepEqual(parseDeviceDashboardState({ you: 4, root: null, focus: 2, webReviewMode: 'unknown' }), {
    you: '', root: '', focus: null, webReviewMode: 'webviewer', finishedOpen: false, foldedGroups: [],
  })
  assert.equal(parseDeviceDashboardState({ finishedOpen: true }).finishedOpen, true)
  assert.equal(parseDeviceDashboardState({ finishedOpen: 'yes' }).finishedOpen, false)
})

test('folded review groups parse as a list of unique group keys', () => {
  assert.deepEqual(parseDeviceDashboardState({ foldedGroups: ['Boards/Job Hunt.md', '', 'Boards/Job Hunt.md'] }).foldedGroups, ['Boards/Job Hunt.md', ''])
  assert.deepEqual(parseDeviceDashboardState({ foldedGroups: ['a', 2, null] }).foldedGroups, ['a'])
  assert.deepEqual(parseDeviceDashboardState({ foldedGroups: 'a' }).foldedGroups, [])
})

test('legacy state keeps the device\'s folded review groups', () => {
  assert.deepEqual(splitLegacyDashboardState({}, { foldedGroups: ['a'] }).device.foldedGroups, ['a'])
})

test('withFold adds or removes one group key and keeps the rest', () => {
  assert.deepEqual(withFold(['a'], 'b', true), ['a', 'b'])
  assert.deepEqual(withFold(['a', 'b'], 'a', false), ['b'])
  assert.deepEqual(withFold(['a'], 'a', true), ['a'])
})

test('legacy state splits into device choices and person ticks, with device values taking precedence', () => {
  assert.deepEqual(splitLegacyDashboardState(
    { you: 'Old name', root: 'old-root', focus: 'old-focus', webReviewMode: 'browser', ticks: { a: '2026-10-02 09:30', b: true } },
    { you: 'New name', root: '', focus: null, webReviewMode: 'off' },
  ), {
    device: { you: 'New name', root: '', focus: null, webReviewMode: 'off', finishedOpen: false, foldedGroups: [] },
    personName: 'Old name',
    ticks: { a: '2026-10-02 09:30' },
  })
})

test('legacy ticks stay with their owner when the device selected another person', () => {
  const migrated = splitLegacyDashboardState(
    { you: 'Original owner', ticks: { 'a.md': '2026-10-02 09:30' } },
    { you: 'Current device person' },
  )
  assert.equal(migrated.device.you, 'Current device person')
  assert.equal(migrated.personName, 'Original owner')
  assert.deepEqual(migrated.ticks, { 'a.md': '2026-10-02 09:30' })
})

test('invalid device values fall back to valid legacy choices', () => {
  assert.deepEqual(splitLegacyDashboardState(
    { you: 'Ana', root: 'Main', focus: 'Area', webReviewMode: 'browser' },
    { you: 2, root: null, focus: 5, webReviewMode: 'bad' },
  ).device, { you: 'Ana', root: 'Main', focus: 'Area', webReviewMode: 'browser', finishedOpen: false, foldedGroups: [] })
})

test('person tick files keep timed ticks and drop old untimed ones', () => {
  assert.deepEqual(parsePersonTicks('{"ticks":{"a":"2026-10-02 09:30","b":false,"c":1,"d":true,"e":"soon"}}'), { a: '2026-10-02 09:30' })
})

test('merging ticks keeps every path and the newer time', () => {
  assert.deepEqual(
    mergeTicks({ a: '2026-10-02 09:30', b: '2026-10-02 09:00' }, { a: '2026-10-01 18:00', c: '2026-10-02 10:00' }),
    { a: '2026-10-02 09:30', b: '2026-10-02 09:00', c: '2026-10-02 10:00' },
  )
})

test('person names become one safe path segment', () => {
  assert.equal(safePersonFileName('../Ana/Notes'), '%2E%2E%2FAna%2FNotes')
  assert.equal(safePersonFileName(''), null)
})

test('personTicks reads one person\'s ticks from plugin data', () => {
  const data = { statusColors: {}, people: { Ana: { ticks: { 'a.md': '2026-10-02 09:30', 'b.md': false } }, Sam: { ticks: { 'c.md': '2026-10-02 09:30' } } } }
  assert.deepEqual(personTicks(data, 'Ana'), { 'a.md': '2026-10-02 09:30' })
  assert.deepEqual(personTicks(data, 'Nobody'), {})
  assert.deepEqual(personTicks({ people: 'broken' }, 'Ana'), {})
})

test('withPersonTicks changes only that person, and drops an empty entry', () => {
  const t = '2026-10-02 09:30'
  const data = { statusColors: { doing: '#fff' }, people: { Ana: { ticks: { 'a.md': t } }, Sam: { ticks: { 'c.md': t } } } }
  assert.deepEqual(withPersonTicks(data, 'Ana', { 'b.md': t }), {
    statusColors: { doing: '#fff' }, people: { Ana: { ticks: { 'b.md': t } }, Sam: { ticks: { 'c.md': t } } },
  })
  assert.deepEqual(withPersonTicks(data, 'Ana', {}), { statusColors: { doing: '#fff' }, people: { Sam: { ticks: { 'c.md': t } } } })
  assert.deepEqual(withPersonTicks({}, 'Sam', {}), {})
})

test('applyTickChanges keeps ticks made elsewhere and applies only what changed here', () => {
  const stored = { 'phone.md': '2026-10-02 08:00', 'both.md': '2026-10-02 08:00' }
  const before = { 'both.md': '2026-10-02 08:00', 'mac.md': '2026-10-02 08:30' }
  const after = { 'mac.md': '2026-10-02 08:30', 'new.md': '2026-10-02 09:00' }
  assert.deepEqual(applyTickChanges(stored, before, after), { 'phone.md': '2026-10-02 08:00', 'new.md': '2026-10-02 09:00' })
})
