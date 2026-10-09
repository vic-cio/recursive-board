import { test } from 'node:test'
import assert from 'node:assert/strict'

import { COMMANDS, COMMAND_FLAGS, OPTIONS, renderHelp } from './command-table.ts'

test('the table has each command once, and COMMAND_FLAGS comes from it', () => {
  const names = COMMANDS.map((command) => command.name)
  assert.equal(new Set(names).size, names.length)
  assert.deepEqual(Object.keys(COMMAND_FLAGS), names)
  for (const command of COMMANDS) assert.equal(COMMAND_FLAGS[command.name], command.flags)
  assert.equal(names.includes('hook'), false)
  assert.equal(names.includes('trace'), false)
})

test('every flag in the table is a known option', () => {
  for (const command of COMMANDS) {
    for (const flag of command.flags) assert.ok(flag in OPTIONS, `${command.name} --${flag}`)
  }
})

test('a retired command has no usage line, writes nothing and has a help note; every other has a usage line', () => {
  for (const command of COMMANDS) {
    if (command.kind === 'retired') {
      assert.deepEqual(command.usage, [], command.name)
      assert.equal(command.writes, false, command.name)
      assert.ok(command.notes.length > 0, command.name)
    } else {
      assert.ok(command.usage[0]?.startsWith(`wi ${command.name}`), command.name)
    }
  }
  assert.deepEqual(COMMANDS.filter((command) => command.kind === 'install').map((command) => command.name),
    ['setup', 'doctor', 'update'])
})

test('a read command is marked as one that writes nothing', () => {
  const reads = COMMANDS.filter((command) => command.kind === 'vault' && !command.writes).map((command) => command.name)
  assert.deepEqual(reads, ['agents', 'children', 'ready', 'show', 'validate'])
})

test('each command\'s notes are the help notes about it, in help order', () => {
  const help = renderHelp()
  const status = COMMANDS.find((command) => command.name === 'status')!
  assert.equal(status.notes.length, 4)
  let from = 0
  for (const note of status.notes) {
    const at = help.indexOf(note.split('\n')[0]!, from)
    assert.ok(at > from, note)
    from = at
  }
})
