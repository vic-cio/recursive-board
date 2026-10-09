import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { agentSetupPart, agentSetupSince, changelogSections, compareVersions } from './changelog.ts'

const SAMPLE = `# Changelog

Intro text.

## [Unreleased]

### Agent setup

- Not released yet.

## [0.9.1] - 2026-10-10

### Fixed

- A fix.

## [0.9.0] - 2026-10-08

### Agent setup

- Workers read the skill.
- A second line.

### Added

- wi update.

## [0.8.2] - 2026-10-04

### Agent setup

- Old news.

[Unreleased]: https://example.com/compare/0.9.1...HEAD
[0.9.1]: https://example.com/compare/0.9.0...0.9.1
`

test('changelogSections reads each version section, and stops at the compare links', () => {
  const sections = changelogSections(SAMPLE)
  assert.deepEqual(sections.map((s) => s.version), ['Unreleased', '0.9.1', '0.9.0', '0.8.2'])
  assert.equal(sections[3]!.text, '### Agent setup\n\n- Old news.')
})

test('agentSetupPart takes the Agent setup part up to the next heading', () => {
  const section = changelogSections(SAMPLE).find((s) => s.version === '0.9.0')!
  assert.equal(agentSetupPart(section.text), '- Workers read the skill.\n- A second line.')
  assert.equal(agentSetupPart('### Fixed\n\n- A fix.'), null)
})

test('agentSetupSince lists the released versions after the old one, newest first', () => {
  assert.deepEqual(agentSetupSince(SAMPLE, '0.8.2', '0.9.1'), [
    { version: '0.9.0', text: '- Workers read the skill.\n- A second line.' },
  ])
  assert.deepEqual(agentSetupSince(SAMPLE, '0.8.1', '0.9.1').map((s) => s.version), ['0.9.0', '0.8.2'])
  assert.deepEqual(agentSetupSince(SAMPLE, '0.9.1', '0.9.1'), [])
  assert.deepEqual(agentSetupSince(SAMPLE, '0.8.1', '0.8.2').map((s) => s.version), ['0.8.2'])
})

test('compareVersions orders by major, minor and patch numbers', () => {
  assert.ok(compareVersions('0.8.10', '0.8.9') > 0)
  assert.ok(compareVersions('0.9.0', '1.0.0') < 0)
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0)
  assert.throws(() => compareVersions('next', '1.0.0'), /cannot compare/)
})

test('the repo changelog parses, and 0.8.1 has an Agent setup part', () => {
  const text = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8')
  assert.deepEqual(agentSetupSince(text, '0.8.0', '0.8.2').map((s) => s.version), ['0.8.1'])
})
