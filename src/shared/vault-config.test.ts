import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_VAULT_CONFIG, parseVaultConfig } from './vault-config.ts'

test('a missing vault config keeps Boards and has no default root', () => {
  assert.deepEqual(parseVaultConfig(null), DEFAULT_VAULT_CONFIG)
  assert.deepEqual(parseVaultConfig(null), { workItemFolder: 'Boards', defaultRoot: null, extraSections: [], maxAgents: null })
})

test('the vault config selects a work-item folder and root filename', () => {
  assert.deepEqual(parseVaultConfig('{"workItemFolder":"Projects/Work","defaultRoot":"House move"}'), {
    workItemFolder: 'Projects/Work', defaultRoot: 'House move', extraSections: [], maxAgents: null,
  })
})

test('an existing config can set either option alone', () => {
  assert.deepEqual(parseVaultConfig('{"workItemFolder":"Projects/"}'), {
    workItemFolder: 'Projects', defaultRoot: null, extraSections: [], maxAgents: null,
  })
  assert.deepEqual(parseVaultConfig('{"defaultRoot":"Home"}'), {
    workItemFolder: 'Boards', defaultRoot: 'Home', extraSections: [], maxAgents: null,
  })
})

test('the vault config accepts extra section headings', () => {
  assert.deepEqual(parseVaultConfig('{"extraSections":["References","Risks"]}').extraSections,
    ['References', 'Risks'])
})

test('the vault config accepts a non-negative whole-number agent limit or no limit', () => {
  assert.equal(parseVaultConfig('{"maxAgents":3}').maxAgents, 3)
  assert.equal(parseVaultConfig('{"maxAgents":0}').maxAgents, 0)
  assert.equal(parseVaultConfig('{"maxAgents":null}').maxAgents, null)
  for (const value of ['-1', '1.5', '"2"', 'true']) {
    assert.throws(() => parseVaultConfig(`{"maxAgents":${value}}`), /maxAgents/)
  }
})

test('invalid config fails instead of silently selecting another folder or root', () => {
  for (const source of [
    '{', '[]', '{"workItemFolder":""}', '{"workItemFolder":"/Projects"}',
    '{"workItemFolder":"../Projects"}', '{"workItemFolder":"Projects\\\\Cards"}',
    '{"workItemFolder":7}', '{"defaultRoot":""}', '{"defaultRoot":"[[Home]]"}',
    '{"defaultRoot":true}',
    '{"extraSections":"References"}', '{"extraSections":[7]}',
    '{"extraSections":[""]}', '{"extraSections":["  "]}',
    '{"extraSections":["First\\nSecond"]}',
  ]) {
    assert.throws(() => parseVaultConfig(source), /\.wi\.json/)
  }
})
