import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_VAULT_CONFIG, parseVaultConfig } from './vault-config.ts'

test('a missing vault config keeps Boards and has no default root', () => {
  assert.deepEqual(parseVaultConfig(null), DEFAULT_VAULT_CONFIG)
  assert.deepEqual(parseVaultConfig(null), { workItemFolder: 'Boards', defaultRoot: null })
})

test('the vault config selects a work-item folder and root filename', () => {
  assert.deepEqual(parseVaultConfig('{"workItemFolder":"Projects/Work","defaultRoot":"House move"}'), {
    workItemFolder: 'Projects/Work', defaultRoot: 'House move',
  })
})

test('an existing config can set either option alone', () => {
  assert.deepEqual(parseVaultConfig('{"workItemFolder":"Projects/"}'), {
    workItemFolder: 'Projects', defaultRoot: null,
  })
  assert.deepEqual(parseVaultConfig('{"defaultRoot":"Home"}'), {
    workItemFolder: 'Boards', defaultRoot: 'Home',
  })
})

test('invalid config fails instead of silently selecting another folder or root', () => {
  for (const source of [
    '{', '[]', '{"workItemFolder":""}', '{"workItemFolder":"/Projects"}',
    '{"workItemFolder":"../Projects"}', '{"workItemFolder":"Projects\\\\Cards"}',
    '{"workItemFolder":7}', '{"defaultRoot":""}', '{"defaultRoot":"[[Home]]"}',
    '{"defaultRoot":true}',
  ]) {
    assert.throws(() => parseVaultConfig(source), /\.wi\.json/)
  }
})
