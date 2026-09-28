import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const SCRIPT = fileURLToPath(new URL('./refocus.mjs', import.meta.url))

function setup(t, exitCode = 0) {
  const root = mkdtempSync(join(tmpdir(), 'wi-refocus-coverage-'))
  const bin = join(root, 'bin')
  const state = join(root, 'state')
  const log = join(root, 'invocations.log')
  mkdirSync(bin)
  mkdirSync(state)
  const wi = join(bin, 'wi')
  writeFileSync(wi, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$WI_FIXTURE_LOG"\nprintf '%s' 'Objective chain\\n1. Card\\n   Do the work.\\n'\nexit ${exitCode}\n`)
  chmodSync(wi, 0o755)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { state, log, wi }
}

function invoke(fixture, runtime, payload, controls = {}) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      !key.startsWith('WI_REFOCUS') && key !== 'WI_BIN' && key !== 'WI_CARD' && key !== 'WI_FIXTURE_LOG'),
  )
  const result = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...inherited,
      WI_REFOCUS: 'on',
      WI_REFOCUS_RUNTIME: runtime,
      WI_REFOCUS_STATE_DIR: fixture.state,
      WI_BIN: fixture.wi,
      WI_FIXTURE_LOG: fixture.log,
      ...controls,
    },
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function invocationLog(fixture) {
  try {
    return readFileSync(fixture.log, 'utf8').trim().split('\n')
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

for (const runtime of ['claude', 'codex']) {
  test(`${runtime} startup invokes the fixture only for compact startup`, (t) => {
    const fixture = setup(t)
    assert.equal(invoke(fixture, runtime, { hook_event_name: 'SessionStart', source: 'startup' }), '')
    assert.deepEqual(invocationLog(fixture), [])

    const output = invoke(fixture, runtime, { hook_event_name: 'SessionStart', source: 'compact' })
    assert.match(output, /additionalContext/)
    assert.equal(JSON.parse(output).hookSpecificOutput.hookEventName, 'SessionStart')
    assert.deepEqual(invocationLog(fixture), ['objective'])
  })

  test(`${runtime} disabled delivery does not invoke the fixture`, (t) => {
    const fixture = setup(t)
    assert.equal(
      invoke(fixture, runtime, { hook_event_name: 'SessionStart', source: 'compact' }, { WI_REFOCUS: 'off' }),
      '',
    )
    assert.deepEqual(invocationLog(fixture), [])
  })

  test(`${runtime} failed CLI command stays silent after fixture invocation`, (t) => {
    const fixture = setup(t, 1)
    assert.equal(invoke(fixture, runtime, { hook_event_name: 'SessionStart', source: 'compact' }), '')
    assert.deepEqual(invocationLog(fixture), ['objective'])
  })
}
