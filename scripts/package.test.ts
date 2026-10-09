import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { renderHelp } from '../src/shared/command-table.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function packedFiles(): string[] {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' })
  return JSON.parse(out)[0].files.map((f: { path: string }) => f.path)
}

test('npm pack ships the skill and the changelog, and no agent playbook', () => {
  const files = packedFiles()
  assert.ok(files.includes('skills/recursive-board/SKILL.md'), files.join('\n'))
  assert.ok(files.includes('CHANGELOG.md'), files.join('\n'))
  assert.deepEqual(files.filter((path) => /playbook/i.test(path)), [])
})

test('the README, the skill and the help explain the tools and name no agent playbook', () => {
  for (const [name, text] of [
    ['README.md', read('README.md')],
    ['skills/recursive-board/SKILL.md', read('skills/recursive-board/SKILL.md')],
    ['wi --help', renderHelp()],
  ] as const) {
    assert.doesNotMatch(text, /playbook/i, `${name} names the playbook`)
  }
})

test('the README gives the Git pre-commit snippet as optional advice, and tells nobody to run wi hook', () => {
  const readme = read('README.md')
  const section = readme.split(/^## Version the vault with Git \(optional\)\n/m)[1]?.split(/^## /m)[0]
  assert.ok(section !== undefined, 'the README has the Git section')
  assert.match(section, /optional/i)
  assert.match(section, /--no-verify/)
  assert.match(section, /```sh\n#!\/bin\/sh\n/)
  assert.doesNotMatch(readme, /wi hook (install|uninstall|status) --vault/)
})
