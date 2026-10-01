import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TEMPLATES, DEFAULT_TEMPLATE, findTemplate, requireTemplate, templateNames,
  renderBody, briefGaps,
} from './templates.ts'

test('there is a default template and it is in the registry', () => {
  assert.ok(findTemplate(DEFAULT_TEMPLATE))
  assert.ok(templateNames().includes(DEFAULT_TEMPLATE))
})

test('every template has a name and at least one section', () => {
  const names = new Set<string>()
  for (const template of TEMPLATES) {
    assert.match(template.name, /^[a-z0-9-]+$/, `${template.name} is not a filename-safe name`)
    assert.equal(names.has(template.name), false, `${template.name} is registered twice`)
    names.add(template.name)
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

test('renderBody appends configured headings after the built-in sections, empty', () => {
  const body = renderBody(requireTemplate(), ['References', 'Risks'])
  assert.match(body, /## Notes\n\n## References\n\n## Risks\n?$/)
})

test('renderBody leaves every work-item section empty, so no lone bullet shows', () => {
  const body = renderBody(requireTemplate())
  assert.match(body, /## Acceptance Criteria\n\n## Notes\n/)
  assert.doesNotMatch(body, /^- $/m)
})

test('the first-board card explains how to promote itself', () => {
  const body = renderBody(requireTemplate('first-board-card'))
  assert.match(body, /Promote at the top of this card/)
})

test('renderBody fills the brief in place of the starters', () => {
  const body = renderBody(requireTemplate(), ['Knowledge'], {
    objective: 'Price the demolition lines.',
    context: ['From the site survey.', 'Use the 2026 rates.'],
    criteria: ['Every line has a rate', 'The total matches the survey'],
  })
  assert.equal(body, [
    '## Objective', '', 'Price the demolition lines.', '',
    '## Context', '', 'From the site survey.', '', 'Use the 2026 rates.', '',
    '## Acceptance Criteria', '', '- Every line has a rate', '- The total matches the survey', '',
    '## Notes', '',
    '## Knowledge', '',
  ].join('\n'))
})

test('renderBody refuses a brief section the template lacks', () => {
  assert.throws(() => renderBody(requireTemplate('area'), [], { criteria: ['Done'] }),
    /template "area" has no Acceptance Criteria section/)
  assert.throws(() => renderBody(requireTemplate(), [], { criteria: ['one\ntwo'] }), /one line/)
})

test('briefGaps names the empty Objective and criteria the template asks for', () => {
  assert.deepEqual(briefGaps(requireTemplate()), ['Objective', 'Acceptance Criteria'])
  assert.deepEqual(briefGaps(requireTemplate(), { objective: 'x', criteria: ['y'] }), [])
  assert.deepEqual(briefGaps(requireTemplate('area')), ['Objective'])
  assert.deepEqual(briefGaps(requireTemplate('first-board-card')), [])
})
