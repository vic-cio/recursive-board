import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const playbook = readFileSync(new URL('../docs/playbook.md', import.meta.url), 'utf8')

const BLOCKS = ['summary', 'agents-and-roles', 'role-note', 'dispatching', 'checks', 'git-hook']

// The marker grammar of docs/adr/0067-the-playbook-ships-with-marked-blocks.md.
function blocks(text: string): Map<string, string[]> {
  const found = new Map<string, string[]>()
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const open = /^(`{3,}|~{3,})(.*)$/.exec(lines[i] ?? '')
    if (!open?.[1]) continue
    const fence = open[1]
    const close = /^(`{3,}|~{3,})\s*$/
    const end = lines.findIndex((line, j) => j > i && close.test(line) && line[0] === fence[0] && line.trim().length >= fence.length)
    assert.ok(end > i, `fence on line ${i + 1} is closed`)
    const name = /(?:^|\s)playbook=([a-z-]+)(?:\s|$)/.exec(open[2] ?? '')?.[1]
    if (name) found.set(name, [...(found.get(name) ?? []), lines.slice(i + 1, end).join('\n')])
    i = end
  }
  return found
}

function block(name: string): string {
  const found = blocks(playbook).get(name)
  assert.ok(found?.[0] !== undefined, `the playbook has a ${name} block`)
  return found[0]
}

test('npm pack ships the playbook', () => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' })
  const files = JSON.parse(out)[0].files.map((f: { path: string }) => f.path)
  assert.ok(files.includes('docs/playbook.md'), files.join('\n'))
})

test('the playbook carries each marked block once, and nothing else is marked', () => {
  const found = blocks(playbook)
  assert.deepEqual([...found.keys()].sort(), [...BLOCKS].sort())
  for (const name of BLOCKS) {
    assert.equal(found.get(name)?.length, 1, `${name} appears once`)
    assert.ok(block(name).trim().length > 0, `${name} is not empty`)
  }
})

test('the Agents and roles block is a section that a vault AGENTS.md can take whole', () => {
  assert.match(block('agents-and-roles'), /^## Agents and roles\n/)
})

test('each check line is an id, two spaces, and a text', () => {
  const ids = block('checks').split('\n').map((line) => {
    const m = /^([a-z][a-z-]*) {2,}\S/.exec(line)
    assert.ok(m?.[1], `check line: ${line}`)
    return m[1]
  })
  assert.equal(new Set(ids).size, ids.length)
})

test('the summary fits a terminal', () => {
  for (const line of block('summary').split('\n')) {
    assert.ok(line.length <= 80, `summary line too long: ${line}`)
  }
})

test('the Changes section has one heading per version, newest first, Unreleased on top', () => {
  const changes = playbook.split(/^## Changes\n/m)[1]
  assert.ok(changes !== undefined, 'the playbook has a Changes section')
  assert.doesNotMatch(changes, /^## /m, 'Changes is the last section')
  const headings = [...changes.matchAll(/^### (.+)$/gm)].map((m) => m[1] ?? '')
  assert.ok(headings.length > 0)
  for (const [i, h] of headings.entries()) {
    assert.ok(h === 'Unreleased' ? i === 0 : /^\d+\.\d+\.\d+$/.test(h), `version heading: ${h}`)
  }
  const versions = headings.filter((h) => h !== 'Unreleased').map((h) => h.split('.').map(Number))
  const newestFirst = [...versions].sort((a, b) => (b[0]! - a[0]!) || (b[1]! - a[1]!) || (b[2]! - a[2]!))
  assert.deepEqual(versions, newestFirst)
  assert.equal(new Set(headings).size, headings.length)
})

test('the playbook carries no personal details', () => {
  assert.doesNotMatch(playbook, /\bwi-[a-z0-9]{4}\b/, 'no card ids')
  assert.doesNotMatch(playbook, /\/Users\/|~\/Vaults|Victor|concierge/i)
})

test('the README links the playbook as optional', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  assert.match(readme, /optional \[agent playbook\]\(docs\/playbook\.md\)/i)
})

test('the playbook gives Git versioning as optional advice with a copyable pre-commit snippet', () => {
  assert.match(playbook, /^## Git versioning\n/m)
  const section = playbook.split(/^## Git versioning\n/m)[1]!.split(/^## /m)[0]!
  assert.match(section, /optional/i)
  assert.match(section, /--no-verify/)
  assert.match(block('git-hook'), /^#!\/bin\/sh\n/)
})

test('the README shows the same pre-commit snippet as the playbook, and no hook command to run', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  assert.ok(readme.includes(block('git-hook')), 'the README carries the git-hook block verbatim')
  assert.doesNotMatch(readme, /wi hook (install|uninstall|status) --vault/, 'the README tells nobody to run wi hook')
})

test('the shared parser reads every marked block and check of the shipped playbook', async () => {
  const { playbookBlocks, playbookChecks } = await import('../src/shared/playbook.ts')
  assert.deepEqual([...playbookBlocks(playbook).keys()].sort(), [...BLOCKS].sort())
  assert.equal(playbookChecks(playbook).length, block('checks').split('\n').length)
})
