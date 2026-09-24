import { test } from 'node:test'
import assert from 'node:assert/strict'

import { areaEdits, areaRefusal, type AreaItemState, type AreaTarget } from './area.ts'
import { applyEdits } from './edits.ts'
import { parseFrontmatter, type Frontmatter } from './frontmatter.ts'

const card: AreaItemState = {
  label: 'Streaming.md',
  isRoot: false,
  isArea: false,
  status: 'options',
  agent: undefined,
}

const source = `---
type: work-item
area: false
status: options
prev_status: backlog
owner: Morgan
mystery_key: keep me
updated: 2026-09-21
---

# Streaming
`

function fields(text: string): Frontmatter {
  const frontmatter = parseFrontmatter(text)
  assert.ok(frontmatter)
  return frontmatter
}

test('areaEdits converts a child card and preserves unrelated fields and body', () => {
  const converted = applyEdits(source, areaEdits(card, { kind: 'area' }))
  const result = fields(converted)
  assert.equal(result.get('area'), true)
  assert.equal(result.get('status'), 'options')
  assert.equal(result.has('prev_status'), false)
  assert.equal(result.get('owner'), 'Morgan')
  assert.equal(result.get('mystery_key'), 'keep me')
  assert.ok(converted.endsWith('# Streaming\n'))
})

test('areaEdits converts an area to the chosen status and removes stale area history', () => {
  const area: AreaItemState = { ...card, isArea: true }
  const target: AreaTarget = { kind: 'card', status: 'backlog' }
  const converted = applyEdits(source, areaEdits(area, target))
  const result = fields(converted)
  assert.equal(result.has('area'), false)
  assert.equal(result.get('status'), 'backlog')
  assert.equal(result.has('prev_status'), false)
  assert.equal(result.get('mystery_key'), 'keep me')
})

test('areaEdits keeps the current status when converting a card to an area', () => {
  const result = fields(applyEdits(source, areaEdits(card, { kind: 'area' })))
  assert.equal(result.get('status'), card.status)
})

test('areaEdits refuses a root', () => {
  assert.throws(
    () => areaEdits({ ...card, isRoot: true }, { kind: 'area' }),
    /root is not a card or area child/i,
  )
})

test('areaEdits converts a doing card and refuses a claimed one', () => {
  assert.equal(areaRefusal({ ...card, status: 'doing' }, 'area'), null)
  assert.throws(
    () => areaEdits({ ...card, agent: 'codex' }, { kind: 'area' }),
    /has agent "codex"/i,
  )
})

test('areaEdits refuses converting an item in the wrong direction', () => {
  assert.throws(
    () => areaEdits({ ...card, isArea: true }, { kind: 'area' }),
    /already an area/i,
  )
  assert.throws(
    () => areaEdits(card, { kind: 'card', status: 'doing' }),
    /not an area/i,
  )
})
