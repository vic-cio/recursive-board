import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  boardSettingsRecord, cleanSections, parsePluginData, PLUGIN_DATA_FILE, selectVaultConfig, withBoardSettings,
} from './board-settings.ts'
import { DEFAULT_VAULT_CONFIG } from './vault-config.ts'

const note = (json: string) => `<!-- recursive-board-config -->\n\`\`\`json\n${json}\n\`\`\`\n`

test('the board key in the plugin data wins over the config note and .wi.json', () => {
  const selected = selectVaultConfig({
    pluginData: { people: {}, board: { extraSections: ['Knowledge'], areaTags: true } },
    note: note('{"defaultRoot":"Note root"}'),
    legacy: '{"defaultRoot":"Legacy root"}',
  })
  assert.equal(selected.source, PLUGIN_DATA_FILE)
  assert.deepEqual(selected.config.extraSections, ['Knowledge'])
  assert.equal(selected.config.areaTags, true)
  assert.equal(selected.config.defaultRoot, null)
  assert.deepEqual(selected.leftovers, ['Recursive Board config.md', '.wi.json'])
})

test('without a board key the config note is read, then .wi.json', () => {
  const fromNote = selectVaultConfig({ pluginData: { people: {} }, note: note('{"defaultRoot":"Main"}'), legacy: '{"defaultRoot":"Old"}' })
  assert.equal(fromNote.source, 'Recursive Board config.md')
  assert.equal(fromNote.config.defaultRoot, 'Main')
  assert.deepEqual(fromNote.leftovers, [])

  const fromLegacy = selectVaultConfig({ pluginData: null, note: null, legacy: '{"defaultRoot":"Old"}' })
  assert.equal(fromLegacy.source, '.wi.json')
  assert.equal(fromLegacy.config.defaultRoot, 'Old')
})

test('with no source the defaults apply and name the plugin data file', () => {
  const selected = selectVaultConfig({ pluginData: null, note: null, legacy: null })
  assert.equal(selected.source, PLUGIN_DATA_FILE)
  assert.equal(selected.fromBoard, false)
  assert.deepEqual(selected.config, { ...DEFAULT_VAULT_CONFIG, extraSections: [] })
})

test('an invalid board key is an error, never a fallback to the config note', () => {
  assert.throws(
    () => selectVaultConfig({ pluginData: { board: { maxAgents: -1 } }, note: note('{}'), legacy: null }),
    /data\.json: maxAgents/,
  )
  assert.throws(
    () => selectVaultConfig({ pluginData: { board: ['Boards'] }, note: null, legacy: null }),
    /data\.json: the board settings must be a JSON object/,
  )
})

test('plugin data must be a JSON object', () => {
  assert.deepEqual(parsePluginData('{"board":{}}'), { board: {} })
  assert.throws(() => parsePluginData('{broken'), /data\.json must contain valid JSON/)
  assert.throws(() => parsePluginData('[]'), /data\.json must contain a JSON object/)
})

test('withBoardSettings replaces only the board key', () => {
  const config = { ...DEFAULT_VAULT_CONFIG, extraSections: ['Knowledge'], areaTags: true }
  const data = withBoardSettings({ people: { Victor: { ticks: { 'a.md': true } } }, board: { areaTags: false } }, config)
  assert.deepEqual(data['people'], { Victor: { ticks: { 'a.md': true } } })
  assert.deepEqual(data['board'], boardSettingsRecord(config))
  assert.deepEqual(boardSettingsRecord(config), {
    workItemFolder: 'Boards', defaultRoot: null, extraSections: ['Knowledge'], maxAgents: null, autoPromote: true, areaTags: true,
  })
})

test('cleanSections trims headings, drops blank rows and repeats', () => {
  assert.deepEqual(cleanSections([' Knowledge ', '', 'Risks', 'Knowledge', '   ']), ['Knowledge', 'Risks'])
})
