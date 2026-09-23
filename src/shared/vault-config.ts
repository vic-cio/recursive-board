/** The one vault-level setting read by both wi and the plugin. No platform imports belong here. */
import { fileNameStem } from './schema.ts'

export const WI_CONFIG_FILE = '.wi.json'

export interface VaultConfig {
  /** Vault-relative directory. Work items sit directly in it. */
  workItemFolder: string
  /** Filename stem of the root item, or null when new items require an explicit parent. */
  defaultRoot: string | null
}

export const DEFAULT_VAULT_CONFIG: Readonly<VaultConfig> = {
  workItemFolder: 'Boards',
  defaultRoot: null,
}

/** Parse at the vault boundary; malformed config must never silently select another folder. */
export function parseVaultConfig(text: string | null): VaultConfig {
  if (text === null) return { ...DEFAULT_VAULT_CONFIG }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`${WI_CONFIG_FILE} must contain valid JSON.`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${WI_CONFIG_FILE} must contain a JSON object.`)
  }

  const folderValue = 'workItemFolder' in value ? value.workItemFolder : undefined
  const rootValue = 'defaultRoot' in value ? value.defaultRoot : undefined
  let workItemFolder = DEFAULT_VAULT_CONFIG.workItemFolder
  if (folderValue !== undefined) {
    if (typeof folderValue !== 'string') {
      throw new Error(`${WI_CONFIG_FILE}: workItemFolder must be a vault-relative folder path.`)
    }
    workItemFolder = folderValue.replace(/\/$/, '')
    if (
      workItemFolder === '' || workItemFolder.startsWith('/') ||
      workItemFolder.split('/').some((part) => part === '' || part === '.' || part === '..') ||
      /[\\:\0]/.test(workItemFolder)
    ) {
      throw new Error(`${WI_CONFIG_FILE}: workItemFolder must be a vault-relative folder path.`)
    }
  }

  let defaultRoot: string | null = null
  if (rootValue !== undefined && rootValue !== null) {
    if (typeof rootValue !== 'string' || rootValue === '' || fileNameStem(rootValue) !== rootValue) {
      throw new Error(`${WI_CONFIG_FILE}: defaultRoot must be a work-item filename stem.`)
    }
    defaultRoot = rootValue
  }
  return { workItemFolder, defaultRoot }
}
