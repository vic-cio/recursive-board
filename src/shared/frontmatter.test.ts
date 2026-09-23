import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseFrontmatter, setKey, removeKey, formatScalar } from './frontmatter.ts'

const ITEM = `---
type: work-item
id: wi-0004
title: Build server
status: backlog
parent: "[[Ship the mobile app]]"
owner: sam
priority: 2
created: 2026-09-21
updated: 2026-09-21
---

# Build server

## Objective

Manage task sessions securely.
`

test('parseFrontmatter reads every scalar key', () => {
  const fm = parseFrontmatter(ITEM)
  assert.ok(fm)
  assert.equal(fm.get('type'), 'work-item')
  assert.equal(fm.get('id'), 'wi-0004')
  assert.equal(fm.get('status'), 'backlog')
  assert.equal(fm.get('owner'), 'sam')
})

test('parseFrontmatter strips the quotes from a wikilink value', () => {
  const fm = parseFrontmatter(ITEM)!
  assert.equal(fm.get('parent'), '[[Ship the mobile app]]')
})

test('parseFrontmatter keeps a number as a number', () => {
  const fm = parseFrontmatter(ITEM)!
  assert.equal(fm.get('priority'), 2)
})

test('parseFrontmatter keeps a date as a string in ISO form', () => {
  const fm = parseFrontmatter(ITEM)!
  assert.equal(fm.get('created'), '2026-09-21')
})

test('parseFrontmatter reports the keys in file order', () => {
  const fm = parseFrontmatter(ITEM)!
  assert.deepEqual(fm.keys(), [
    'type', 'id', 'title', 'status', 'parent', 'owner', 'priority', 'created', 'updated',
  ])
})

test('parseFrontmatter returns null when the file has no frontmatter', () => {
  assert.equal(parseFrontmatter('# Just a heading\n'), null)
})

test('parseFrontmatter returns null when the block never closes', () => {
  assert.equal(parseFrontmatter('---\ntype: work-item\n\n# Body\n'), null)
})

test('parseFrontmatter reads an empty frontmatter block', () => {
  const fm = parseFrontmatter('---\n---\n\n# Body\n')
  assert.ok(fm)
  assert.deepEqual(fm.keys(), [])
})

test('parseFrontmatter preserves a block list as one entry', () => {
  const text = `---
id: wi-0001
tags:
  - alpha
  - beta
status: doing
---

# Body
`
  const fm = parseFrontmatter(text)!
  assert.deepEqual(fm.keys(), ['id', 'tags', 'status'])
  assert.equal(fm.get('status'), 'doing')
  assert.equal(fm.get('tags'), undefined, 'a block list has no scalar value')
})

test('setKey rewrites one line and leaves every other byte alone', () => {
  const out = setKey(ITEM, 'status', 'doing')
  assert.equal(out, ITEM.replace('status: backlog', 'status: doing'))
})

test('setKey preserves an unknown key it was not asked to touch', () => {
  const text = ITEM.replace('owner: sam', 'owner: sam\nsomething_nobody_knows: 42')
  const out = setKey(text, 'status', 'done')
  assert.match(out, /^something_nobody_knows: 42$/m)
})

test('setKey quotes a wikilink value', () => {
  const out = setKey(ITEM, 'parent', '[[Main]]')
  assert.match(out, /^parent: "\[\[Main\]\]"$/m)
})

test('setKey leaves a date bare', () => {
  const out = setKey(ITEM, 'updated', '2026-09-22')
  assert.match(out, /^updated: 2026-09-22$/m)
})

test('setKey preserves the existing line when the value is unchanged', () => {
  const text = ITEM.replace('status: backlog', 'status: "backlog"')
  assert.equal(setKey(text, 'status', 'backlog'), text)
})

test('setKey appends a missing key just before the closing fence', () => {
  const out = setKey(ITEM, 'board', true)
  assert.match(out, /^updated: 2026-09-21\nboard: true\n---$/m)
})

test('setKey replaces a block entry with a single line', () => {
  const text = `---
id: wi-0001
tags:
  - alpha
  - beta
status: doing
---

# Body
`
  const out = setKey(text, 'tags', 'alpha')
  assert.equal(out, `---
id: wi-0001
tags: alpha
status: doing
---

# Body
`)
})

test('setKey never touches the body', () => {
  const out = setKey(ITEM, 'status', 'done')
  assert.ok(out.endsWith('# Build server\n\n## Objective\n\nManage task sessions securely.\n'))
})

test('setKey throws when the file has no frontmatter', () => {
  assert.throws(() => setKey('# Body\n', 'status', 'done'), /frontmatter/i)
})

test('removeKey deletes the key and nothing else', () => {
  const text = setKey(ITEM, 'board', true)
  assert.equal(removeKey(text, 'board'), ITEM)
})

test('removeKey deletes every line of a block entry', () => {
  const text = `---
id: wi-0001
tags:
  - alpha
  - beta
status: doing
---

# Body
`
  assert.equal(removeKey(text, 'tags'), `---
id: wi-0001
status: doing
---

# Body
`)
})

test('removeKey is a no-op when the key is absent', () => {
  assert.equal(removeKey(ITEM, 'board'), ITEM)
})

test('parse and edit survive CRLF line endings', () => {
  const crlf = ITEM.replaceAll('\n', '\r\n')
  const fm = parseFrontmatter(crlf)!
  assert.equal(fm.get('status'), 'backlog')
  const out = setKey(crlf, 'status', 'doing')
  assert.equal(out, crlf.replace('status: backlog', 'status: doing'))
})

test('formatScalar quotes only what YAML would otherwise misread', () => {
  assert.equal(formatScalar('doing'), 'doing')
  assert.equal(formatScalar('Build the server'), 'Build the server')
  assert.equal(formatScalar('2026-09-22'), '2026-09-22')
  assert.equal(formatScalar('[[Main]]'), '"[[Main]]"')
  assert.equal(formatScalar('true'), '"true"')
  assert.equal(formatScalar('42'), '"42"')
  assert.equal(formatScalar(''), '""')
  assert.equal(formatScalar('a: b'), '"a: b"')
  assert.equal(formatScalar('trailing '), '"trailing "')
  assert.equal(formatScalar(true), 'true')
  assert.equal(formatScalar(2), '2')
})

test('formatScalar escapes a quote inside a value', () => {
  assert.equal(formatScalar('say "hi"'), '"say \\"hi\\""')
})
