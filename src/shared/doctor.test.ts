import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { agentSetupChecks, isSetupNote, skillCheck, type AgentSetupInput, type CheckResult, type SetupNote } from './doctor.ts'

const PLAYBOOK = readFileSync(new URL('../../docs/playbook.md', import.meta.url), 'utf8')

const AGENTS_MD = '# Rules\n\n## Agents and roles\n\nEvery agent on a card is a worker.\n'
const DISPATCHING = '---\ntype: procedure\n---\n\n7. Wait for your workers in the foreground. Never wait in a background task.\n'

function note(path: string, fields: Partial<SetupNote> = {}): SetupNote {
  return { path, tags: [], workItem: false, ...fields }
}

/** A vault that follows every recommendation. */
function followed(): AgentSetupInput {
  return {
    playbook: PLAYBOOK,
    agentsMd: AGENTS_MD,
    notes: [
      note('Roles/Dispatching.md', { type: 'procedure', text: DISPATCHING }),
      note('Roles/Coder.md', { tags: ['role/coder'], text: '## Procedure\n\n1. Claim the card.\n' }),
      note('People/Ada.md', { type: 'person' }),
    ],
    openRoleTags: ['role/coder'],
    maxAgents: 4,
    skill: [
      { path: '/home/.claude/skills/recursive-board', state: 'current' },
      { path: '/home/.agents/skills/recursive-board', state: 'current' },
    ],
  }
}

function byId(results: CheckResult[], id: string): CheckResult {
  const found = results.find((result) => result.id === id)
  assert.ok(found, `a ${id} result`)
  return found
}

test('one result per check id in the playbook, in its order, each with the playbook text', () => {
  const results = agentSetupChecks(followed())
  assert.deepEqual(results.map((result) => result.id),
    ['agents-md', 'dispatching-note', 'role-notes', 'person-note', 'max-agents', 'skill', 'background-wait'])
  for (const result of results) {
    assert.equal(result.level, 'pass', `${result.id}: ${result.message}`)
    assert.ok(result.title.length > 0)
    assert.equal(result.paste, undefined)
  }
})

test('a check id that this wi does not know is a note, never a fix', () => {
  const playbook = PLAYBOOK.replace('```text playbook=checks\n', '```text playbook=checks\nfuture-check  Something new.\n')
  const result = byId(agentSetupChecks({ ...followed(), playbook }), 'future-check')
  assert.equal(result.level, 'note')
  assert.match(result.message, /update wi/i)
})

test('agents-md: a missing AGENTS.md or a missing section prints the Agents and roles block', () => {
  for (const agentsMd of [null, '# Rules\n\nNothing about agents.\n']) {
    const result = byId(agentSetupChecks({ ...followed(), agentsMd }), 'agents-md')
    assert.equal(result.level, 'fix')
    assert.match(result.paste ?? '', /^## Agents and roles\n/)
  }
  assert.match(byId(agentSetupChecks({ ...followed(), agentsMd: null }), 'agents-md').message, /no AGENTS\.md/)
})

test('dispatching-note: a note named Dispatching, or a procedure described as Dispatching, passes', () => {
  const described = note('Roles/Dispatcher.md', { type: 'procedure', description: 'Dispatching: the shared procedure.' })
  const others = followed().notes.filter((n) => n.path !== 'Roles/Dispatching.md')
  assert.equal(byId(agentSetupChecks({ ...followed(), notes: [...others, described] }), 'dispatching-note').level, 'pass')

  const missing = byId(agentSetupChecks({ ...followed(), notes: others }), 'dispatching-note')
  assert.equal(missing.level, 'fix')
  assert.match(missing.paste ?? '', /^---\ntype: procedure\n/)
  assert.match(missing.message, /Roles\/Dispatching\.md/)
})

test('dispatching-note: a work item called Dispatching is not the procedure', () => {
  const others = followed().notes.filter((n) => n.path !== 'Roles/Dispatching.md')
  const card = note('Boards/Dispatching.md', { workItem: true })
  assert.equal(byId(agentSetupChecks({ ...followed(), notes: [...others, card] }), 'dispatching-note').level, 'fix')
})

test('role-notes: each role tag on an open card without a note is named, with the example role note', () => {
  const result = byId(agentSetupChecks({ ...followed(), openRoleTags: ['role/coder', '#Role/Checker', 'role/checker'] }), 'role-notes')
  assert.equal(result.level, 'fix')
  assert.match(result.message, /role\/checker/i)
  assert.doesNotMatch(result.message, /role\/coder/)
  assert.match(result.paste ?? '', /tags: \[role\/coder\]/)
})

test('role-notes: a work item that carries the tag is not its note', () => {
  const card = note('Boards/Review.md', { tags: ['role/checker'], workItem: true })
  const result = byId(agentSetupChecks({ ...followed(), notes: [...followed().notes, card], openRoleTags: ['role/checker'] }), 'role-notes')
  assert.equal(result.level, 'fix')
})

test('role-notes: no role tag on an open card passes', () => {
  const result = byId(agentSetupChecks({ ...followed(), openRoleTags: [] }), 'role-notes')
  assert.equal(result.level, 'pass')
})

test('person-note: no person note prints a person note to paste', () => {
  const result = byId(agentSetupChecks({ ...followed(), notes: followed().notes.filter((n) => n.type !== 'person') }), 'person-note')
  assert.equal(result.level, 'fix')
  assert.match(result.paste ?? '', /^---\ntype: person\n---/)
})

test('max-agents: an unset limit names the setting', () => {
  const result = byId(agentSetupChecks({ ...followed(), maxAgents: null }), 'max-agents')
  assert.equal(result.level, 'fix')
  assert.match(result.message, /Concurrent agent limit/)
  assert.equal(byId(agentSetupChecks({ ...followed(), maxAgents: 0 }), 'max-agents').level, 'pass')
})

test('skill: with no packaged skill to compare with, the result is a note', () => {
  const result = byId(agentSetupChecks({ ...followed(), skill: null }), 'skill')
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

test('background-wait: a role or procedure note that waits in a background task prints step 7', () => {
  const old = note('Roles/Dispatching.md', {
    type: 'procedure',
    text: '7. In one background command, wait for each worker: `while kill -0 <pid>; do sleep 30; done`.\n',
  })
  const notes = [...followed().notes.filter((n) => n.path !== 'Roles/Dispatching.md'), old]
  const result = byId(agentSetupChecks({ ...followed(), notes }), 'background-wait')
  assert.equal(result.level, 'fix')
  assert.match(result.message, /Roles\/Dispatching\.md/)
  assert.match(result.paste ?? '', /^7\. Wait for your workers in the foreground/)
  assert.doesNotMatch(result.paste ?? '', /^8\./m)
})

test('background-wait: a line that says never wait in the background, or starts workers in the background, passes', () => {
  const ok = note('Roles/Coder.md', {
    tags: ['role/coder'],
    text: 'Start each worker in the background.\nNever wait in a background task.\n',
  })
  const result = byId(agentSetupChecks({ ...followed(), notes: [...followed().notes, ok] }), 'background-wait')
  assert.equal(result.level, 'pass')
})

test('isSetupNote picks the notes whose text the checks read', () => {
  assert.equal(isSetupNote(note('Roles/Coder.md', { tags: ['role/coder'] })), true)
  assert.equal(isSetupNote(note('Roles/Dispatching.md')), true)
  assert.equal(isSetupNote(note('Roles/Other.md', { type: 'procedure' })), true)
  assert.equal(isSetupNote(note('Notes/Plain.md')), false)
  assert.equal(isSetupNote(note('Boards/Card.md', { tags: ['role/coder'], workItem: true })), false)
})
