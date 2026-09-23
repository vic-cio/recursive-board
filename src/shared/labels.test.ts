import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readLabels, labelColour, labelText, LABEL_COLOURS } from './labels.ts'

test('readLabels reads a YAML list', () => {
  assert.deepEqual(readLabels(['web', 'urgent']), ['web', 'urgent'])
})

test('readLabels reads the one-string form Obsidian also accepts', () => {
  assert.deepEqual(readLabels('web, urgent'), ['web', 'urgent'])
  assert.deepEqual(readLabels('web urgent'), ['web', 'urgent'])
})

test('readLabels strips a leading hash', () => {
  assert.deepEqual(readLabels(['#web']), ['web'])
})

test('readLabels drops duplicates, ignoring case', () => {
  assert.deepEqual(readLabels(['web', 'Web', '#WEB']), ['web'])
})

test('readLabels returns nothing for an absent or unusable value', () => {
  assert.deepEqual(readLabels(undefined), [])
  assert.deepEqual(readLabels(null), [])
  assert.deepEqual(readLabels(''), [])
  assert.deepEqual(readLabels(42), [])
  assert.deepEqual(readLabels(['', '  ']), [])
})

test('readLabels keeps the order the file gives', () => {
  assert.deepEqual(readLabels(['zeta', 'alpha']), ['zeta', 'alpha'])
})

test('labelColour is one of the eight every theme defines', () => {
  for (const label of ['web', 'urgent', 'app', 'x', '']) {
    assert.ok((LABEL_COLOURS as readonly string[]).includes(labelColour(label)), label)
  }
})

test('labelColour is stable, which is what lets it replace a settings pane', () => {
  assert.equal(labelColour('web'), labelColour('web'))
})

test('labelColour ignores case and a leading hash, so one label is one colour', () => {
  assert.equal(labelColour('web'), labelColour('Web'))
  assert.equal(labelColour('web'), labelColour('#WEB'))
  assert.equal(labelColour('web'), labelColour('  web  '))
})

test('labelColour spreads a realistic set across several colours', () => {
  const labels = ['web', 'app', 'urgent', 'research', 'mobile', 'infra', 'design', 'docs']
  const used = new Set(labels.map(labelColour))
  assert.ok(used.size >= 4, `only ${used.size} colours used, which would read as one blur`)
})

test('labelText shows the last segment of a nested tag', () => {
  assert.equal(labelText('area/web'), 'web')
  assert.equal(labelText('web'), 'web')
  assert.equal(labelText('a/b/c'), 'c')
})
