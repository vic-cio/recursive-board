/** Parse and update the JSON block in the synced Markdown config note. */
export const VAULT_CONFIG_NOTE = 'Recursive Board config.md'

export function parseConfigNote(_text: string): Record<string, unknown> {
  return {}
}

export function writeConfigNote(_text: string | null, _config: Readonly<Record<string, unknown>>): string {
  return ''
}

export function mergeDefaultRootNote(_text: string | null, _rootStem: string): string {
  return ''
}

export type VaultConfigEvent =
  | { kind: 'create' | 'modify' | 'delete'; path: string }
  | { kind: 'rename'; path: string; oldPath: string }

export function isVaultConfigEvent(_event: VaultConfigEvent): boolean {
  return false
}
