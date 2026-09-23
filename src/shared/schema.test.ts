import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isStatus, parseWikilink, formatWikilink, fileNameStem, fileNameFor, idSuffix, newId, today,
  STATUSES, CORE_FIELDS,
} from './schema.ts'

test('the four statuses are the only statuses', () => {
  assert.deepEqual([...STATUSES], ['backlog', 'options', 'doing', 'done'])
  for (const s of STATUSES) assert.ok(isStatus(s))
  assert.equal(isStatus('active'), false, 'the spec section 12 fifth value stays rejected')
  assert.equal(isStatus(''), false)
  assert.equal(isStatus(undefined), false)
  assert.equal(isStatus('Doing'), false, 'status is lowercase')
})

test('the frozen schema is nine core fields', () => {
  assert.equal(CORE_FIELDS.length, 9)
})

test('parseWikilink reads a plain link', () => {
  assert.equal(parseWikilink('[[Build server]]'), 'Build server')
})

test('parseWikilink drops an alias and a heading anchor', () => {
  assert.equal(parseWikilink('[[Build server|the server]]'), 'Build server')
  assert.equal(parseWikilink('[[Build server#Objective]]'), 'Build server')
})

test('parseWikilink returns null for a value that is not a wikilink', () => {
  assert.equal(parseWikilink('Build server'), null)
  assert.equal(parseWikilink(''), null)
  assert.equal(parseWikilink(undefined), null)
  assert.equal(parseWikilink(42), null)
  assert.equal(parseWikilink('[[]]'), null)
})

test('formatWikilink round-trips', () => {
  assert.equal(parseWikilink(formatWikilink('Main')), 'Main')
})

test('fileNameStem replaces the characters Obsidian and macOS reject', () => {
  assert.equal(fileNameStem('Build server'), 'Build server')
  assert.equal(fileNameStem('Ship v1/v2'), 'Ship v1-v2')
  assert.equal(fileNameStem('What: now?'), 'What- now-')
  assert.equal(fileNameStem('A [[link]] title'), 'A --link-- title')
  assert.equal(fileNameStem('  padded  '), 'padded')
  assert.equal(fileNameStem('...'), 'Untitled')
  assert.equal(fileNameStem(''), 'Untitled')
})

test('fileNameFor uses the plain title when it is free', () => {
  assert.equal(fileNameFor('Authentication', 'wi-b2e1', new Set()), 'Authentication')
})

test('fileNameFor adds the id suffix when the title is taken', () => {
  const taken = new Set(['authentication'])
  assert.equal(fileNameFor('Authentication', 'wi-b2e1', taken), 'Authentication--b2e1')
})

test('fileNameFor compares case-insensitively, because macOS does', () => {
  const taken = new Set(['authentication'])
  assert.equal(fileNameFor('AUTHENTICATION', 'wi-b2e1', taken), 'AUTHENTICATION--b2e1')
})

test('idSuffix strips the prefix', () => {
  assert.equal(idSuffix('wi-a7f3'), 'a7f3')
  assert.equal(idSuffix('a7f3'), 'a7f3')
})

test('newId mints a wi- id of lowercase alphanumerics', () => {
  assert.match(newId(new Set()), /^wi-[a-z0-9]{4}$/)
})

test('newId never returns an id that is taken', () => {
  // A generator that always proposes the same short id until the length grows.
  const taken = new Set(['wi-aaaa'])
  const id = newId(taken, () => 0)
  assert.equal(id, 'wi-aaaaa')
})

test('newId avoids a large set of taken ids', () => {
  const taken = new Set<string>()
  for (let i = 0; i < 500; i++) taken.add(newId(taken))
  assert.equal(taken.size, 500)
})

test('today renders local time as YYYY-MM-DD', () => {
  assert.equal(today(new Date(2026, 8, 22, 23, 30)), '2026-09-22')
  assert.equal(today(new Date(2026, 0, 1, 0, 5)), '2026-01-01')
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/)
})
