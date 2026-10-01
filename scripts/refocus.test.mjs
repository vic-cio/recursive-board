import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync, chmodSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const SCRIPT = fileURLToPath(new URL('./refocus.mjs', import.meta.url))

function setup(t, output = JSON.stringify({
  id: 'wi-0001', title: 'Card', objective: 'Do the work.', ancestry: [
    { id: 'wi-0000', title: 'Main', objective: 'Run the project.' },
  ],
}) + '\n') {
  const root = mkdtempSync(join(tmpdir(), 'wi-refocus-'))
  const bin = join(root, 'bin')
  const state = join(root, 'state')
  mkdirSync(bin)
  mkdirSync(state)
  const wi = join(bin, 'wi')
  writeFileSync(wi, `#!/bin/sh\nprintf '%s' "$*" > "$WI_TEST_ARGS"\nprintf '%s' "$WI_CARD" > "$WI_TEST_CARD"\n${output === null ? 'exit 1' : `printf '%s' '${output.replaceAll("'", "'\\''")}'`}\n`)
  chmodSync(wi, 0o755)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, bin, state, wi }
}

function invoke(f, payload, env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${f.bin}:${process.env.PATH}`,
      WI_REFOCUS_STATE_DIR: f.state,
      WI_REFOCUS_BYTES: '10',
      WI_CARD: 'wi-0001',
      WI_TEST_ARGS: join(f.root, 'args'),
      WI_TEST_CARD: join(f.root, 'card'),
      ...env,
    },
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test('fresh startup stays silent for both runtimes', (t) => {
  const f = setup(t)
  assert.equal(invoke(f, { hook_event_name: 'SessionStart', source: 'startup' }), '')
  assert.equal(invoke(f, { hook_event_name: 'SessionStart', source: 'resume' }), '')
})

test('Claude and Codex deliver once at compact SessionStart', (t) => {
  const f = setup(t)
  for (const runtime of ['claude', 'codex']) {
    const output = invoke(f, { hook_event_name: 'SessionStart', source: 'compact' }, { WI_REFOCUS_RUNTIME: runtime })
    assert.match(output, /additionalContext/)
    assert.equal(JSON.parse(output).hookSpecificOutput.hookEventName, 'SessionStart')
    assert.equal(JSON.parse(output).hookSpecificOutput.additionalContext,
      'Objective chain (current card to root):\n' +
      '1. Card (wi-0001)\n   Do the work.\n' +
      '2. Main (wi-0000)\n   Run the project.\n')
  }
})

test('the hook reads wi show --json for WI_CARD and stays silent without WI_CARD', (t) => {
  const f = setup(t)
  const output = invoke(f, { hook_event_name: 'SessionStart', source: 'compact' }, { WI_REFOCUS_RUNTIME: 'codex' })
  assert.match(output, /additionalContext/)
  assert.equal(readFileSync(join(f.root, 'args'), 'utf8'), 'show wi-0001 --json')
  assert.equal(readFileSync(join(f.root, 'card'), 'utf8'), 'wi-0001')

  rmSync(join(f.root, 'args'), { force: true })
  rmSync(join(f.root, 'card'), { force: true })
  assert.equal(invoke(f, { hook_event_name: 'SessionStart', source: 'compact' }, {
    WI_REFOCUS_RUNTIME: 'codex', WI_CARD: '', WI_AGENT: 'codex',
  }), '')
  assert.equal(existsSync(join(f.root, 'args')), false)
})

test('Claude transcript growth delivers on the next prompt only', (t) => {
  const f = setup(t)
  const transcript = join(f.root, 'transcript.jsonl')
  writeFileSync(transcript, 'a')
  const stop = { hook_event_name: 'Stop', transcript_path: transcript }
  assert.equal(invoke(f, stop, { WI_REFOCUS_RUNTIME: 'claude' }), '')
  appendFileSync(transcript, '12345678901')
  assert.equal(invoke(f, stop, { WI_REFOCUS_RUNTIME: 'claude' }), '')
  const prompt = { hook_event_name: 'UserPromptSubmit', prompt: 'continue' }
  const output = invoke(f, prompt, { WI_REFOCUS_RUNTIME: 'claude' })
  assert.match(output, /additionalContext/)
  assert.equal(JSON.parse(output).hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.match(JSON.parse(output).hookSpecificOutput.additionalContext, /Do the work/)
  assert.equal(invoke(f, prompt, { WI_REFOCUS_RUNTIME: 'claude' }), '')
})

test('Codex ignores transcript growth but honors on-demand refocus once', (t) => {
  const f = setup(t)
  const transcript = join(f.root, 'transcript.jsonl')
  writeFileSync(transcript, '123456789012345')
  assert.equal(invoke(f, { hook_event_name: 'Stop', transcript_path: transcript }, { WI_REFOCUS_RUNTIME: 'codex' }), '')
  const prompt = { hook_event_name: 'UserPromptSubmit', prompt: 'continue' }
  const first = invoke(f, prompt, { WI_REFOCUS_RUNTIME: 'codex', WI_REFOCUS_NOW: '1' })
  assert.match(first, /additionalContext/)
  assert.match(JSON.parse(first).hookSpecificOutput.additionalContext, /Do the work/)
  assert.equal(invoke(f, prompt, { WI_REFOCUS_RUNTIME: 'codex', WI_REFOCUS_NOW: '1' }), '')
  assert.match(invoke(f, prompt, { WI_REFOCUS_RUNTIME: 'codex', WI_REFOCUS_NOW: '0' }), /additionalContext/)
})

test('disabled, malformed, missing transcript, and command failure cases stay silent', (t) => {
  const f = setup(t)
  assert.equal(invoke(f, { hook_event_name: 'SessionStart', source: 'compact' }, { WI_REFOCUS: 'off' }), '')
  assert.equal(invoke(f, '{broken'), '')
  assert.equal(invoke(f, { hook_event_name: 'Stop', transcript_path: join(f.root, 'missing') }, { WI_REFOCUS_RUNTIME: 'claude' }), '')
  const broken = setup(t, null)
  assert.equal(invoke(broken, { hook_event_name: 'SessionStart', source: 'compact' }), '')
  const malformed = setup(t, 'not-json')
  assert.equal(invoke(malformed, { hook_event_name: 'SessionStart', source: 'compact' }), '')
})

test('the hook caps model-visible context', (t) => {
  const f = setup(t, JSON.stringify({
    id: 'wi-0001', title: 'Card', objective: 'x'.repeat(10000), ancestry: [],
  }))
  const output = invoke(f, { hook_event_name: 'SessionStart', source: 'compact' }, { WI_REFOCUS_RUNTIME: 'codex' })
  assert.match(output, /additionalContext/)
  const context = JSON.parse(output).hookSpecificOutput.additionalContext
  assert.ok(context.length <= 5000, `context was ${context.length} characters`)
  assert.match(context, /truncated/i)
})
