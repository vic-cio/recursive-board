#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const DEFAULT_BYTES = 2_600_000
const MAX_CONTEXT = 4_800

function readPayload() {
  try {
    const text = readFileSync(0, 'utf8')
    const value = JSON.parse(text)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
    return value
  } catch {
    return null
  }
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function sessionKey(payload) {
  const identity = nonEmpty(payload.session_id) ?? nonEmpty(payload.cwd) ?? nonEmpty(process.env['WI_CARD']) ?? process.cwd()
  return createHash('sha256').update(identity).digest('hex')
}

function statePath(key) {
  const directory = nonEmpty(process.env['WI_REFOCUS_STATE_DIR']) ?? join(homedir(), '.cache', 'recursive-board', 'refocus')
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    return join(directory, `${key}.json`)
  } catch {
    return null
  }
}

function readState(path) {
  if (!path) return { transcriptBytes: null, latestBytes: null, growthDue: false, nowToken: null }
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('bad state')
    return {
      transcriptBytes: Number.isSafeInteger(value.transcriptBytes) ? value.transcriptBytes : null,
      latestBytes: Number.isSafeInteger(value.latestBytes) ? value.latestBytes : null,
      growthDue: value.growthDue === true,
      nowToken: typeof value.nowToken === 'string' ? value.nowToken : null,
    }
  } catch {
    return { transcriptBytes: null, latestBytes: null, growthDue: false, nowToken: null }
  }
}

function writeState(path, state) {
  if (!path) return
  try {
    const temporary = `${path}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, path)
  } catch {
    // State is an optimization. A failed write must not affect an agent turn.
  }
}

function transcriptSize(path) {
  if (!path) return null
  try {
    const bytes = statSync(path).size
    return Number.isSafeInteger(bytes) ? bytes : null
  } catch {
    return null
  }
}

function enabled() {
  const setting = (process.env['WI_REFOCUS'] ?? 'on').trim().toLowerCase()
  return setting === 'on' || setting === 'threshold'
}

function threshold() {
  const value = process.env['WI_REFOCUS_BYTES']
  if (value === undefined || value.trim() === '') return DEFAULT_BYTES
  if (!/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function runObjective(cwd) {
  const binary = nonEmpty(process.env['WI_BIN']) ?? 'wi'
  try {
    const result = spawnSync(binary, ['objective'], {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 64 * 1024,
      timeout: 4_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    if (result.error || result.status !== 0 || typeof result.stdout !== 'string') return ''
    return result.stdout.trim()
  } catch {
    return ''
  }
}

function writeContext(eventName, context) {
  const marker = '\n[output truncated]'
  const bounded = context.length > MAX_CONTEXT
    ? `${context.slice(0, MAX_CONTEXT - marker.length).trimEnd()}${marker}`
    : context
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: { hookEventName: eventName, additionalContext: bounded },
  })}\n`)
}

function main(payload) {
  if (!payload || !enabled()) return
  const runtime = process.env['WI_REFOCUS_RUNTIME']
  if (runtime !== 'claude' && runtime !== 'codex') return
  const eventName = nonEmpty(payload.hook_event_name)
  const key = sessionKey(payload)
  if (!eventName) return
  const path = statePath(key)
  const state = readState(path)

  if (eventName === 'SessionStart') {
    const size = transcriptSize(nonEmpty(payload.transcript_path))
    state.transcriptBytes = size
    state.latestBytes = size
    state.growthDue = false
    writeState(path, state)
    if (payload.source !== 'compact') return
    const context = runObjective(nonEmpty(payload.cwd))
    if (context) writeContext(eventName, context)
    return
  }

  if (eventName === 'Stop') {
    if (runtime !== 'claude') return
    const size = transcriptSize(nonEmpty(payload.transcript_path))
    const bytes = threshold()
    if (size === null || bytes === null) return
    if (state.transcriptBytes === null || size < state.transcriptBytes) {
      state.transcriptBytes = size
      state.latestBytes = size
      writeState(path, state)
      return
    }
    if (size - state.transcriptBytes >= bytes) state.growthDue = true
    state.latestBytes = size
    writeState(path, state)
    return
  }

  if (eventName !== 'UserPromptSubmit') return
  const now = nonEmpty(process.env['WI_REFOCUS_NOW'])
  if (!now) state.nowToken = null
  const due = (now !== null && now !== state.nowToken) || (runtime === 'claude' && state.growthDue)
  if (!due) {
    writeState(path, state)
    return
  }
  const context = runObjective(nonEmpty(payload.cwd))
  if (!context) return
  if (now) state.nowToken = now
  if (runtime === 'claude' && state.growthDue) {
    state.transcriptBytes = transcriptSize(nonEmpty(payload.transcript_path)) ?? state.latestBytes
    state.latestBytes = state.transcriptBytes
    state.growthDue = false
  }
  writeState(path, state)
  writeContext(eventName, context)
}

main(readPayload())
