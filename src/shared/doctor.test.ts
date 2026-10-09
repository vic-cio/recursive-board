import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DOCTOR_CHECKS, installChecks, rulesCheck, skillCheck } from './doctor.ts'

test('skill: with no packaged skill to compare with, the result is a note', () => {
  const result = skillCheck(null)
  assert.equal(result.level, 'note')
  assert.match(result.message, /not compared/)
})

test('skill: a missing or old managed copy prints wi setup', () => {
  for (const state of ['missing', 'differs'] as const) {
    const result = skillCheck([{ path: '/a', state: 'current' }, { path: '/b', state }])
    assert.equal(result.level, 'fix')
    assert.equal(result.paste, 'wi setup')
    assert.match(result.message, /\/b/)
  }
})

test('skill: a dev link passes, and a folder that wi setup did not install is a note', () => {
  assert.equal(skillCheck([{ path: '/a', state: 'dev-link' }, { path: '/b', state: 'current' }]).level, 'pass')
  const unmanaged = skillCheck([{ path: '/a', state: 'current' }, { path: '/b', state: 'unmanaged' }])
  assert.equal(unmanaged.level, 'note')
  assert.match(unmanaged.message, /--force/)
})

test('the checks name no agent setup, and the install checks are those the plugin skips', () => {
  assert.deepEqual(DOCTOR_CHECKS.map((check) => check.id),
    ['node', 'package', 'wi-version', 'vault', 'plugin-version', 'rules', 'board-settings', 'hook', 'validate', 'skill'])
  assert.deepEqual(installChecks().map((check) => check.id),
    ['node', 'package', 'wi-version', 'vault', 'plugin-version', 'hook', 'skill'])
  for (const check of DOCTOR_CHECKS) assert.doesNotMatch(check.title, /playbook/i)
})

test('rulesCheck passes on an equal marker and reports a mismatch either way', () => {
  assert.equal(rulesCheck(3, 'wi', 3).level, 'pass')
  const newer = rulesCheck(4, 'wi', 3)
  assert.equal(newer.level, 'fix')
  assert.match(newer.message, /rules version 4.*wi has rules version 3.*Update wi\./)
  const older = rulesCheck(2, 'wi', 3)
  assert.equal(older.level, 'fix')
  assert.match(older.message, /Update the plugin/)
  assert.equal(rulesCheck(null, 'wi', 3).level, 'note')
  assert.equal(rulesCheck(3, 'wi', 3).id, 'rules')
})
