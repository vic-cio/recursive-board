/**
 * The rules version: one whole number for the shared rules that wi and the plugin carry
 * (docs/adr/0079-the-rules-version-marker-lives-in-the-plugin-data.md).
 *
 * Raise RULES_VERSION when a shared rule changes what a command writes. The plugin raises the
 * marker in its plugin data to its own rules version; wi only reads it. A write command warns
 * when the marker is newer than its own rules, and never refuses.
 */
import { parsePluginData, PLUGIN_DATA_FILE } from './board-settings.ts'
import { readIfPresent, type StoragePort } from './storage.ts'

export const RULES_VERSION = 1

/** The top-level key of the plugin data that holds the marker. */
export const RULES_MARKER_KEY = 'rulesVersion'

/** The version line: the package version first, so a script that reads the first word still works. */
export function versionLine(version: string, rules: number = RULES_VERSION): string {
  return `${version} (rules ${rules})`
}

/** The marker in parsed plugin data, or null when there is none or it is not a whole number above 0. */
export function rulesMarkerIn(pluginData: unknown): number | null {
  if (typeof pluginData !== 'object' || pluginData === null || Array.isArray(pluginData)) return null
  const value = (pluginData as Record<string, unknown>)[RULES_MARKER_KEY]
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/**
 * The marker through the port, or null when the plugin data is missing, has no marker, or cannot
 * be read. A broken plugin data file is reported by the command that reads the settings.
 */
export async function readRulesMarker(port: StoragePort): Promise<number | null> {
  try {
    const text = await readIfPresent(port, PLUGIN_DATA_FILE)
    return text === null ? null : rulesMarkerIn(parsePluginData(text))
  } catch {
    return null
  }
}

/**
 * The plugin data with the marker raised to `rules`, or null when nothing changes: the data is
 * missing (the plugin then creates no file), or the marker is already as new.
 */
export function withRaisedRulesMarker(pluginData: unknown, rules: number = RULES_VERSION): Record<string, unknown> | null {
  if (typeof pluginData !== 'object' || pluginData === null || Array.isArray(pluginData)) return null
  const marker = rulesMarkerIn(pluginData)
  if (marker !== null && marker >= rules) return null
  return { ...(pluginData as Record<string, unknown>), [RULES_MARKER_KEY]: rules }
}

/** The warning a write command prints when the marker is newer than its rules, else null. */
export function newerRulesWarning(marker: number | null, rules: number = RULES_VERSION): string | null {
  if (marker === null || marker <= rules) return null
  return `warning: a plugin with rules version ${marker} works on this vault, and this command has rules version ${rules}. ` +
    'It writes by the older rules. Update wi and the plugin.'
}
