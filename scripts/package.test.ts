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

test('the README, its docs pages, the skill and the help explain the tools and name no agent playbook', () => {
  for (const [name, text] of [
    ['README.md', read('README.md')],
    ...['commands', 'configuration', 'work-items', 'git-hook', 'development']
      .map((page) => [`docs/${page}.md`, read(`docs/${page}.md`)] as const),
    ['skills/recursive-board/SKILL.md', read('skills/recursive-board/SKILL.md')],
    ['wi --help', renderHelp()],
  ] as const) {
    assert.doesNotMatch(text, /playbook/i, `${name} names the playbook`)
  }
})

test('the README gives the Git pre-commit snippet as optional advice, and tells nobody to run wi hook', () => {
  const readme = read('README.md')
  // wi doctor's hook note sends the reader to this README section by name.
  const section = readme.split(/^## Version the vault with Git \(optional\)\n/m)[1]?.split(/^## /m)[0]
  assert.ok(section !== undefined, 'the README has the Git section')
  assert.match(section, /optional/i)
  assert.match(section, /\(https:\/\/github\.com\/vic-cio\/recursive-board\/blob\/main\/docs\/git-hook\.md\)/, 'the section links the snippet')
  const page = read('docs/git-hook.md')
  assert.match(page, /optional/i)
  assert.match(page, /--no-verify/)
  assert.match(page, /```sh\n#!\/bin\/sh\n/)
  for (const text of [readme, page]) assert.doesNotMatch(text, /wi hook (install|uninstall|status) --vault/)
})

/** The anchor GitHub gives a heading: lower case, punctuation dropped, spaces as hyphens. */
const slug = (heading: string) => heading.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replaceAll(' ', '-')
const anchors = (text: string) => new Set([...text.matchAll(/^#+ (.+)$/gm)].map((m) => slug(m[1]!)))

test('every README link resolves: in-page anchors exist, and docs links are absolute URLs to files that exist', () => {
  const readme = read('README.md')
  const links = [...readme.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!)
  assert.ok(links.length > 10, 'the scan finds the links')
  const blob = 'https://github.com/vic-cio/recursive-board/blob/main/'
  for (const link of links) {
    if (link.startsWith('#')) {
      assert.ok(anchors(readme).has(link.slice(1)), `${link} names a README heading`)
      continue
    }
    assert.match(link, /^https:\/\//, `${link} is absolute, so it works on npm and on the plugin listing`)
    if (!link.startsWith(blob)) continue
    const [path, anchor] = link.slice(blob.length).split('#') as [string, string | undefined]
    const text = read(path)
    if (anchor !== undefined) assert.ok(anchors(text).has(anchor), `${link} names a heading in ${path}`)
  }
  assert.ok(links.some((link) => link.startsWith(`${blob}docs/`)), 'the README links its docs pages')
})
