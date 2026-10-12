import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  findPerson, knownPeople, parsePeopleList, personNameProblem, personNoteSuggestions, unknownPersonMessage,
  withoutPerson, withPerson,
} from './people.ts'
import { readPeopleList, withBoardSettings, withPeopleList } from './board-settings.ts'
import { DEFAULT_VAULT_CONFIG } from './vault-config.ts'

test('a person name is one line, has no brackets or pipe, and is not agent', () => {
  assert.equal(personNameProblem('Ana Lee'), null)
  assert.equal(personNameProblem(' Victor '), null)
  assert.match(personNameProblem('  ') ?? '', /needs a name/)
  assert.match(personNameProblem('Ana\nLee') ?? '', /one line/)
  assert.match(personNameProblem('[[Ana]]') ?? '', /cannot contain/)
  assert.match(personNameProblem('Ana|A') ?? '', /cannot contain/)
  assert.match(personNameProblem('Agent') ?? '', /reserved/)
})

test('the people list parses trimmed names, drops repeats in any case, and refuses bad values', () => {
  assert.deepEqual(parsePeopleList(undefined, 'x'), [])
  assert.deepEqual(parsePeopleList([' Victor', 'ana', 'victor', 'Ana'], 'x'), ['Victor', 'ana'])
  assert.throws(() => parsePeopleList('Victor', 'data.json'), /^Error: data\.json: people must be an array of names\.$/)
  assert.throws(() => parsePeopleList([3], 'x'), /entry 3, and a name is a string/)
  assert.throws(() => parsePeopleList(['agent'], 'x'), /reserved/)
})

test('withPerson adds a name once, compared without case, and withoutPerson removes it in any case', () => {
  assert.deepEqual(withPerson(['Victor'], ' Ana '), ['Victor', 'Ana'])
  assert.throws(() => withPerson(['Victor'], 'VICTOR'), /^Error: Victor is in the list already\.$/)
  assert.throws(() => withPerson([], 'agent'), /reserved/)
  assert.deepEqual(withoutPerson(['Victor', 'Ana'], 'victor'), ['Ana'])
})

test('known people are the list, then each person note it does not name, and the list spelling wins', () => {
  const people = knownPeople(['Victor'], new Map([['victor', 'victor'], ['sam', 'Sam']]))
  assert.deepEqual([...people.entries()], [['victor', 'Victor'], ['sam', 'Sam']])
  assert.equal(findPerson(people, 'VICTOR'), 'Victor')
  assert.equal(findPerson(people, 'Sam.md'), 'Sam')
  assert.equal(findPerson(people, 'Vic'), undefined)
})

test('the People setting suggests each person note the list does not name yet', () => {
  assert.deepEqual(personNoteSuggestions(['Victor'], ['victor', 'Sam', 'Ana', 'sam', 'agent']), ['Ana', 'Sam'])
})

test('the refusal for an unknown person is one sentence that names the People setting', () => {
  assert.equal(unknownPersonMessage(' Vic '), 'Vic is not a person in this vault: add the person in the plugin settings under People.')
})

test('the people list lives in the board key, and changing it keeps every other key', () => {
  const data = { statusColors: { doing: '#ffffff' }, board: { workItemFolder: 'Cards', areaTags: 'legacy' } }
  const withList = withPeopleList(data, ['Victor', 'Ana'])
  assert.deepEqual(withList, {
    statusColors: { doing: '#ffffff' }, board: { workItemFolder: 'Cards', areaTags: 'legacy', people: ['Victor', 'Ana'] },
  })
  assert.deepEqual(readPeopleList(withList), ['Victor', 'Ana'])
  assert.deepEqual(withPeopleList(withList, []), data, 'an empty list removes the key')
  assert.deepEqual(readPeopleList({}), [])
  assert.deepEqual(readPeopleList({ board: {} }), [])
})

test('saving the board settings keeps the people list', () => {
  const data = withBoardSettings({ board: { people: ['Victor'] } }, { ...DEFAULT_VAULT_CONFIG, extraSections: [], maxAgents: 2 })
  assert.deepEqual(readPeopleList(data), ['Victor'])
  assert.equal((data['board'] as Record<string, unknown>)['maxAgents'], 2)
})
