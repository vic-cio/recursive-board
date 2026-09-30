/** Parse the JSON block in the old config note. Only the plugin's migration reads it now (docs/adr/0050-board-settings-in-plugin-data.md). */
export const VAULT_CONFIG_NOTE = 'Recursive Board config.md'

export function parseConfigNote(text: string): Record<string, unknown> {
  const markers = [...text.matchAll(/^<!-- recursive-board-config -->[ \t]*$/gm)]
  if (markers.length !== 1) {
    throw new Error(`${VAULT_CONFIG_NOTE} must contain one marked JSON config block.`)
  }
  const marker = markers[0]!
  const markerEnd = marker.index + marker[0].length
  const remainder = text.slice(markerEnd)
  const fence = /^\r?\n```json\r?\n([\s\S]*?)\r?\n```(?:\r?\n|$)/.exec(remainder)
  if (!fence) throw new Error(`${VAULT_CONFIG_NOTE} must contain one marked JSON config block.`)

  let value: unknown
  try {
    value = JSON.parse(fence[1]!)
  } catch {
    throw new Error(`${VAULT_CONFIG_NOTE} must contain valid JSON.`)
  }
  if (!isRecord(value)) throw new Error(`${VAULT_CONFIG_NOTE} must contain a JSON object.`)
  return value
}

export type VaultConfigEvent =
  | { kind: 'create' | 'modify' | 'delete'; path: string }
  | { kind: 'rename'; path: string; oldPath: string }

export function isVaultConfigEvent(event: VaultConfigEvent): boolean {
  if (event.kind === 'rename') {
    return event.path === VAULT_CONFIG_NOTE || event.oldPath === VAULT_CONFIG_NOTE
  }
  return event.path === VAULT_CONFIG_NOTE
}

export function parseLegacyConfig(text: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('.wi.json must contain valid JSON.')
  }
  if (!isRecord(value)) throw new Error('.wi.json must contain a JSON object.')
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
