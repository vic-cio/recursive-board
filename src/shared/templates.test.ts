import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TEMPLATES, DEFAULT_TEMPLATE, findTemplate, requireTemplate, templateNames,
  renderBody, renderVaultTemplate,
} from './templates.ts'
import { parseFrontmatter } from './frontmatter.ts'
import { STATUSES, WORK_ITEM_TYPE } from './schema.ts'

test('there is a default template and it is in the registry', () => {
  assert.ok(findTemplate(DEFAULT_TEMPLATE))
  assert.ok(templateNames().includes(DEFAULT_TEMPLATE))
})

test('every template has a name, a description and at least one section', () => {
  const names = new Set<string>()
  for (const template of TEMPLATES) {
    assert.match(template.name, /^[a-z0-9-]+$/, `${template.name} is not a filename-safe name`)
    assert.equal(names.has(template.name), false, `${template.name} is registered twice`)
    names.add(template.name)
    assert.ok(template.description.length > 0)
    assert.ok(template.sections.length > 0)
  }
})

test('requireTemplate falls back to the default', () => {
  assert.equal(requireTemplate().name, DEFAULT_TEMPLATE)
})

test('requireTemplate names what exists when the name is wrong', () => {
  assert.throws(() => requireTemplate('nope'), /no template called "nope"/)
  assert.throws(() => requireTemplate('nope'), new RegExp(DEFAULT_TEMPLATE))
})

test('renderBody writes the sections in order, with no H1', () => {
  const body = renderBody(requireTemplate())
  assert.doesNotMatch(body, /^# /m, 'Obsidian already draws the filename as the title')
  assert.ok(body.startsWith('## Objective'))
  assert.ok(body.indexOf('## Objective') < body.indexOf('## Context'))
  assert.doesNotMatch(body, /^## Knowledge$/m)
})

test('renderBody appends configured headings after the built-in sections with bullet starters', () => {
  const body = renderBody(requireTemplate(), ['References', 'Risks'])
  assert.match(body, /## Notes\n\n## References\n\n- \n\n## Risks\n\n- \n?$/)
})

test('renderBody includes a section starter where one is defined', () => {
  const body = renderBody(requireTemplate())
  assert.match(body, /## Acceptance Criteria\n\n- \n/)
})

test('the vault template parses as frontmatter with the core fields', () => {
  const text = renderVaultTemplate(requireTemplate())
  const fm = parseFrontmatter(text)
  assert.ok(fm)
  assert.deepEqual(fm.keys(), ['type', 'id', 'title', 'status', 'parent', 'created', 'updated'])
  assert.equal(fm.get('type'), WORK_ITEM_TYPE)
  assert.equal(fm.get('parent'), undefined)
  assert.ok((STATUSES as readonly string[]).includes(String(fm.get('status'))))
})

test('the vault template uses the configured root filename as its parent', () => {
  const fm = parseFrontmatter(renderVaultTemplate(requireTemplate(), 'House move'))!
  assert.equal(fm.get('parent'), '[[House move]]')
})

test('the vault template writes neither board nor prev_status', () => {
  const fm = parseFrontmatter(renderVaultTemplate(requireTemplate()))!
  assert.equal(fm.has('board'), false, 'absence is what "not a board" means')
  assert.equal(fm.has('prev_status'), false)
})

test('the vault template leaves the fields a human fills in blank', () => {
  const text = renderVaultTemplate(requireTemplate())
  assert.match(text, /^title:$/m)
  assert.match(text, /^created:$/m)
  assert.match(text, /^updated:$/m)
  assert.match(text, /^id: wi-XXXX$/m)
})

test('the vault template and a new work item share one body', () => {
  const body = renderBody(requireTemplate())
  assert.ok(renderVaultTemplate(requireTemplate()).endsWith(body))
})
