import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  accountName, assignChoices, isYou, resolveYourName, waitChoices, waitsOnLabel, youFirst, YOUR_NAME_KEY,
} from './identity.ts'

const people = ['Victor', 'Ana Lee', 'Sam']

test('the account name is read from the app only when it is a string', () => {
  assert.equal(accountName({ account: { name: ' Victor ' } }), 'Victor')
  assert.equal(accountName({ account: { name: 3 } }), '')
  assert.equal(accountName({ account: null }), '')
  assert.equal(accountName({}), '')
  assert.equal(accountName(undefined), '')
})

test('with no stored choice, Your name defaults to the person named like the account, in the list spelling', () => {
  assert.equal(resolveYourName(null, people, 'victor'), 'Victor')
  assert.equal(resolveYourName(undefined, people, 'ANA LEE'), 'Ana Lee')
  assert.equal(resolveYourName(null, people, 'Nobody'), '', 'an account name that is no person gives no default')
  assert.equal(resolveYourName(null, people, ''), '')
  assert.equal(resolveYourName(null, [], 'Victor'), '', 'the choices come from the people list only')
})

test('a stored choice wins over the account, and an empty one means no one', () => {
  assert.equal(resolveYourName('sam', people, 'Victor'), 'Sam')
  assert.equal(resolveYourName('', people, 'Victor'), '')
  assert.equal(resolveYourName('Removed', people, 'Victor'), '', 'a name no longer in the list gives no one')
  assert.equal(resolveYourName(42, people, 'Victor'), 'Victor', 'a broken stored value falls back to the account')
})

test('Your name is stored under a key of its own', () => {
  assert.equal(YOUR_NAME_KEY, 'recursive-board:your-name')
})

test('isYou compares without case, and an empty Your name is no one', () => {
  assert.equal(isYou('victor', 'Victor'), true)
  assert.equal(isYou('Sam', 'Victor'), false)
  assert.equal(isYou('', ''), false)
})

test('the wait badge reads Waits on you when the card waits on Your name, else the names', () => {
  assert.equal(waitsOnLabel([], ['Victor'], 'Victor'), 'Waits on you')
  assert.equal(waitsOnLabel([], ['victor'], 'Victor'), 'Waits on you')
  assert.equal(waitsOnLabel([], ['Sam'], 'Victor'), 'Waits on Sam')
  assert.equal(waitsOnLabel([], ['Sam'], ''), 'Waits on Sam')
  assert.equal(waitsOnLabel(['Write the spec'], ['Sam', 'Victor'], 'Victor'), 'Waits on you, Sam, Write the spec')
  assert.equal(waitsOnLabel(['Write the spec'], [], 'Victor'), 'Waits on Write the spec')
})

test('youFirst sorts the people and puts Your name first', () => {
  assert.deepEqual(youFirst(people, 'sam'), ['Sam', 'Ana Lee', 'Victor'])
  assert.deepEqual(youFirst(people, ''), ['Ana Lee', 'Sam', 'Victor'])
})

test('Assign to lists Assign to me first when Your name is set, then the others, then any agent', () => {
  assert.deepEqual(assignChoices(people, 'Victor', []), [
    { kind: 'me', name: 'Victor' }, { kind: 'person', name: 'Ana Lee' }, { kind: 'person', name: 'Sam' }, { kind: 'agent' },
  ])
  assert.deepEqual(assignChoices(people, '', []), [
    { kind: 'person', name: 'Ana Lee' }, { kind: 'person', name: 'Sam' }, { kind: 'person', name: 'Victor' }, { kind: 'agent' },
  ])
})

test('Assign to leaves out a name the card has already, Assign to me included', () => {
  assert.deepEqual(assignChoices(people, 'Victor', ['victor', 'agent']), [
    { kind: 'person', name: 'Ana Lee' }, { kind: 'person', name: 'Sam' },
  ])
})

test('Waits on lists you first and leaves out the people the card waits on already', () => {
  assert.deepEqual(waitChoices(people, 'Sam', []), ['Sam', 'Ana Lee', 'Victor'])
  assert.deepEqual(waitChoices(people, 'Sam', ['sam']), ['Ana Lee', 'Victor'])
  assert.deepEqual(waitChoices(people, '', ['Victor']), ['Ana Lee', 'Sam'])
})
