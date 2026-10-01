import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  boardSettingsRecord, cleanSections, parsePluginData, readBoardSettings, withBoardSettings,
} from './board-settings.ts'
import { DEFAULT_VAULT_CONFIG } from './vault-config.ts'

test('the board key in the plugin data holds the settings', () => {
  const selected = readBoardSettings({ people: {}, board: { extraSections: ['Knowledge'], areaTags: true } })
  assert.equal(selected.fromBoard, true)
  assert.deepEqual(selected.config.extraSections, ['Knowledge'])
  assert.equal('areaTags' in selected.config, false)
  assert.equal(selected.config.defaultRoot, null)
})

test('without a board key the defaults apply', () => {
  for (const pluginData of [null, { people: {} }]) {
    const selected = readBoardSettings(pluginData)
    assert.equal(selected.fromBoard, false)
    assert.deepEqual(selected.config, { ...DEFAULT_VAULT_CONFIG, extraSections: [] })
  }
})

test('an invalid board key is an error, never the defaults', () => {
  assert.throws(() => readBoardSettings({ board: { maxAgents: -1 } }), /data\.json: maxAgents/)
  assert.throws(() => readBoardSettings({ board: ['Boards'] }), /data\.json: the board settings must be a JSON object/)
})

test('plugin data must be a JSON object', () => {
  assert.deepEqual(parsePluginData('{"board":{}}'), { board: {} })
  assert.throws(() => parsePluginData('{broken'), /data\.json must contain valid JSON/)
  assert.throws(() => parsePluginData('[]'), /data\.json must contain a JSON object/)
})

test('withBoardSettings preserves an old areaTags key and other plugin data', () => {
  const config = { ...DEFAULT_VAULT_CONFIG, extraSections: ['Knowledge'] }
  const data = withBoardSettings({ people: { Victor: { ticks: { 'a.md': true } } }, board: { areaTags: 'legacy' } }, config)
  assert.deepEqual(data['people'], { Victor: { ticks: { 'a.md': true } } })
  assert.deepEqual(data['board'], { ...boardSettingsRecord(config), areaTags: 'legacy' })
  assert.deepEqual(boardSettingsRecord(config), {
    workItemFolder: 'Boards', defaultRoot: null, extraSections: ['Knowledge'], maxAgents: null, autoPromote: true,
  })
})

test('cleanSections trims headings, drops blank rows and repeats', () => {
  assert.deepEqual(cleanSections([' Knowledge ', '', 'Risks', 'Knowledge', '   ']), ['Knowledge', 'Risks'])
})
