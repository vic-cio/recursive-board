/**
 * The board settings live under one `board` key in the plugin data file
 * (docs/adr/0050-board-settings-in-plugin-data.md). The plugin is their one writer; wi reads them.
 * No other file holds them. No platform imports belong here.
 */
import { DEFAULT_VAULT_CONFIG, parseVaultConfigValues, type VaultConfig } from './vault-config.ts'
import { parsePeopleList, PEOPLE_KEY } from './people.ts'

export const BOARD_SETTINGS_KEY = 'board'
/** Vault-relative. Obsidian lets a user rename `.obsidian`; wi does not support that. */
export const PLUGIN_DATA_FILE = '.obsidian/plugins/recursive-board/data.json'

export interface SelectedConfig {
  config: VaultConfig
  /** True when the plugin data holds a board key. */
  fromBoard: boolean
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

/** The board key, or the defaults when the plugin data has none. An invalid key is an error, never the defaults. */
export function readBoardSettings(pluginData: unknown): SelectedConfig {
  const board = boardSettingsIn(pluginData)
  if (board === null) return { config: { ...DEFAULT_VAULT_CONFIG, extraSections: [] }, fromBoard: false }
  return { config: parseVaultConfigValues(board, PLUGIN_DATA_FILE), fromBoard: true }
}

/** Every setting, in a fixed order, as the plugin writes it. */
export function boardSettingsRecord(config: Readonly<VaultConfig>): Record<string, unknown> {
  return {
    workItemFolder: config.workItemFolder,
    defaultRoot: config.defaultRoot,
    extraSections: [...config.extraSections],
    maxAgents: config.maxAgents,
    autoPromote: config.autoPromote,
  }
}

/**
 * Replaces the board key and keeps every other key of the plugin data. The people list and an old
 * `areaTags` key stay in the board key: neither is a field of the config.
 */
export function withBoardSettings(pluginData: Readonly<Record<string, unknown>>, config: Readonly<VaultConfig>): Record<string, unknown> {
  const oldBoard = pluginData[BOARD_SETTINGS_KEY]
  const legacyAreaTags = isRecord(oldBoard) && 'areaTags' in oldBoard
    ? { areaTags: oldBoard['areaTags'] }
    : {}
  const people = isRecord(oldBoard) && PEOPLE_KEY in oldBoard ? { [PEOPLE_KEY]: oldBoard[PEOPLE_KEY] } : {}
  return { ...pluginData, [BOARD_SETTINGS_KEY]: { ...boardSettingsRecord(config), ...legacyAreaTags, ...people } }
}

/**
 * The people list in the plugin data (docs/adr/0085-people-live-in-the-plugin-data.md), or an
 * empty list when there is none. An invalid list is an error, never an empty list.
 */
export function readPeopleList(pluginData: unknown): string[] {
  const board = boardSettingsIn(pluginData)
  return board === null ? [] : parsePeopleList(board[PEOPLE_KEY], PLUGIN_DATA_FILE)
}

/**
 * Replaces the people list in the board key and keeps every other key. An empty list removes the
 * key. The plugin is the one writer; wi never calls this.
 */
export function withPeopleList(pluginData: Readonly<Record<string, unknown>>, people: readonly string[]): Record<string, unknown> {
  const oldBoard = pluginData[BOARD_SETTINGS_KEY]
  const board: Record<string, unknown> = isRecord(oldBoard) ? { ...oldBoard } : {}
  if (people.length > 0) board[PEOPLE_KEY] = [...people]
  else delete board[PEOPLE_KEY]
  return { ...pluginData, [BOARD_SETTINGS_KEY]: board }
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
