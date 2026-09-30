/**
 * The board settings live under one `board` key in the plugin data file
 * (docs/adr/0050-board-settings-in-plugin-data.md). The plugin is their one writer; wi reads them.
 * The config note and `.wi.json` are read only until the plugin migrates them. No platform imports belong here.
 */
import { parseConfigNote, parseLegacyConfig, VAULT_CONFIG_NOTE } from './vault-config-note.ts'
import { parseVaultConfig, parseVaultConfigValues, WI_CONFIG_FILE, type VaultConfig } from './vault-config.ts'

export const BOARD_SETTINGS_KEY = 'board'
/** Vault-relative. Obsidian lets a user rename `.obsidian`; wi does not support that. */
export const PLUGIN_DATA_FILE = '.obsidian/plugins/recursive-board/data.json'

export type ConfigSource = typeof PLUGIN_DATA_FILE | typeof VAULT_CONFIG_NOTE | typeof WI_CONFIG_FILE

export interface SelectedConfig {
  config: VaultConfig
  /** The file the settings came from. The defaults name the plugin data file, where they belong. */
  source: ConfigSource
  /** True when the plugin data holds a board key. */
  fromBoard: boolean
  /** Old config files that still exist next to a board key. */
  leftovers: ConfigSource[]
}

export function parsePluginData(text: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`${PLUGIN_DATA_FILE} must contain valid JSON.`)
  }
  if (!isRecord(value)) throw new Error(`${PLUGIN_DATA_FILE} must contain a JSON object.`)
  return value
}

/** The raw board key, or null when the plugin data has none. */
export function boardSettingsIn(pluginData: unknown): Record<string, unknown> | null {
  if (!isRecord(pluginData) || !(BOARD_SETTINGS_KEY in pluginData)) return null
  const board = pluginData[BOARD_SETTINGS_KEY]
  if (!isRecord(board)) throw new Error(`${PLUGIN_DATA_FILE}: the board settings must be a JSON object.`)
  return board
}

/** Reads the board key first, then the config note, then `.wi.json`. An invalid source never falls through. */
export function selectVaultConfig(sources: {
  pluginData: unknown
  note: string | null
  legacy: string | null
}): SelectedConfig {
  const board = boardSettingsIn(sources.pluginData)
  if (board !== null) {
    const leftovers: ConfigSource[] = []
    if (sources.note !== null) leftovers.push(VAULT_CONFIG_NOTE)
    if (sources.legacy !== null) leftovers.push(WI_CONFIG_FILE)
    return { config: parseVaultConfigValues(board, PLUGIN_DATA_FILE), source: PLUGIN_DATA_FILE, fromBoard: true, leftovers }
  }
  if (sources.note !== null) {
    return { config: parseVaultConfigValues(parseConfigNote(sources.note), VAULT_CONFIG_NOTE), source: VAULT_CONFIG_NOTE, fromBoard: false, leftovers: [] }
  }
  if (sources.legacy !== null) {
    return { config: parseVaultConfigValues(parseLegacyConfig(sources.legacy), WI_CONFIG_FILE), source: WI_CONFIG_FILE, fromBoard: false, leftovers: [] }
  }
  return { config: parseVaultConfig(null), source: PLUGIN_DATA_FILE, fromBoard: false, leftovers: [] }
}

/** Every setting, in a fixed order, as the plugin writes it. */
export function boardSettingsRecord(config: Readonly<VaultConfig>): Record<string, unknown> {
  return {
    workItemFolder: config.workItemFolder,
    defaultRoot: config.defaultRoot,
    extraSections: [...config.extraSections],
    maxAgents: config.maxAgents,
    autoPromote: config.autoPromote,
    areaTags: config.areaTags,
  }
}

/** Replaces the board key and keeps every other key of the plugin data. */
export function withBoardSettings(pluginData: Readonly<Record<string, unknown>>, config: Readonly<VaultConfig>): Record<string, unknown> {
  return { ...pluginData, [BOARD_SETTINGS_KEY]: boardSettingsRecord(config) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The Extra sections rows as a setting: trimmed, with blank rows and repeats dropped. */
export function cleanSections(rows: readonly string[]): string[] {
  const sections: string[] = []
  for (const row of rows) {
    const heading = row.trim()
    if (heading !== '' && !sections.includes(heading)) sections.push(heading)
  }
  return sections
}
