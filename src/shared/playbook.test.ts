import { test } from 'node:test'
import assert from 'node:assert/strict'

import { playbookBlock, playbookBlocks, playbookChanges, playbookChecks } from './playbook.ts'

const TEXT = [
  '# Playbook',
  '',
  '```text playbook=summary',
  'Line one.',
  '',
  'Line two.',
  '```',
  '',
  '````markdown playbook=agents-and-roles',
  '## Agents and roles',
  '',
  '```sh',
  'wi claim <card>',
  '```',
  '````',
  '',
  '```text',
  'not marked',
  '```',
  '',
  '```text playbook=checks',
  'agents-md         AGENTS.md has an "Agents and roles" heading.',
  'max-agents  The board settings set maxAgents.',
  '```',
  '',
  '## Changes',
  '',
  '### Unreleased',
  '',
  '- Next change.',
  '',
  '### 0.8.3',
  '',
  '- First version.',
  '',
].join('\n')

test('playbookBlocks maps each marker name to the text of its fence', () => {
  const blocks = playbookBlocks(TEXT)
  assert.deepEqual([...blocks.keys()], ['summary', 'agents-and-roles', 'checks'])
  assert.equal(blocks.get('summary'), 'Line one.\n\nLine two.')
})

test('a longer fence keeps a shorter fence inside its block', () => {
  assert.equal(playbookBlock(TEXT, 'agents-and-roles'), '## Agents and roles\n\n```sh\nwi claim <card>\n```')
})

test('playbookBlock returns null for a name that the text does not mark', () => {
  assert.equal(playbookBlock(TEXT, 'dispatching'), null)
})

test('the first block wins when a name is marked twice', () => {
  const twice = '```text playbook=summary\nfirst\n```\n\n```text playbook=summary\nsecond\n```\n'
  assert.equal(playbookBlock(twice, 'summary'), 'first')
})

test('an unclosed fence marks nothing', () => {
  assert.equal(playbookBlock('```text playbook=summary\nopen to the end\n', 'summary'), null)
})

test('playbookChecks reads an id and a text from each check line', () => {
  assert.deepEqual(playbookChecks(TEXT), [
    { id: 'agents-md', text: 'AGENTS.md has an "Agents and roles" heading.' },
    { id: 'max-agents', text: 'The board settings set maxAgents.' },
  ])
})

test('playbookChecks skips a line that is not an id, two spaces, and a text', () => {
  const text = '```text playbook=checks\nok-id  Text.\nno id here\n\n```\n'
  assert.deepEqual(playbookChecks(text), [{ id: 'ok-id', text: 'Text.' }])
})

test('playbookChanges lists each version heading with its text, newest first', () => {
  assert.deepEqual(playbookChanges(TEXT), [
    { version: 'Unreleased', text: '- Next change.' },
    { version: '0.8.3', text: '- First version.' },
  ])
})

test('playbookChanges is empty without a Changes section', () => {
  assert.deepEqual(playbookChanges('# Playbook\n'), [])
})

test('CRLF line ends read the same as LF', () => {
  assert.equal(playbookBlock(TEXT.replaceAll('\n', '\r\n'), 'summary'), 'Line one.\n\nLine two.')
})
