/** Parse and update the JSON block in the synced Markdown config note. */
export const VAULT_CONFIG_NOTE = 'Recursive Board config.md'
export const VAULT_CONFIG_MARKER = '<!-- recursive-board-config -->'

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

export function writeConfigNote(text: string | null, config: Readonly<Record<string, unknown>>): string {
  const json = JSON.stringify(config, null, 2)
  if (text === null) return `${VAULT_CONFIG_MARKER}\n\`\`\`json\n${json}\n\`\`\`\n`
  return replaceConfigJson(text, json)
}

function replaceConfigJson(text: string, json: string): string {
  const markers = [...text.matchAll(/^<!-- recursive-board-config -->[ \t]*$/gm)]
  if (markers.length !== 1) {
    throw new Error(`${VAULT_CONFIG_NOTE} must contain one marked JSON config block.`)
  }
  const marker = markers[0]!
  const start = marker.index + marker[0].length
  const remainder = text.slice(start)
  const fence = /^(\r?\n```json\r?\n)([\s\S]*?)(\r?\n```)/.exec(remainder)
  if (!fence) throw new Error(`${VAULT_CONFIG_NOTE} must contain one marked JSON config block.`)
  parseConfigNote(text)
  const bodyStart = start + fence[1]!.length
  const bodyEnd = bodyStart + fence[2]!.length
  return `${text.slice(0, bodyStart)}${json}${text.slice(bodyEnd)}`
}

export function mergeDefaultRootNote(text: string | null, rootStem: string): string {
  const current = text === null ? {} : parseConfigNote(text)
  const updated = { ...current, defaultRoot: rootStem }
  if (text === null) return writeConfigNote(null, updated)
  return replaceConfigJson(text, JSON.stringify(updated))
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

export function createConfigNote(config: Readonly<Record<string, unknown>>): string {
  return writeConfigNote(null, config)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
