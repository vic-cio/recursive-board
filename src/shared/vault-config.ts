/** The one vault-level setting read by both wi and the plugin. No platform imports belong here. */
import { fileNameStem } from './schema.ts'

export const WI_CONFIG_FILE = '.wi.json'

export interface VaultConfig {
  /** Vault-relative directory. Work items sit directly in it. */
  workItemFolder: string
  /** Filename stem of the root item, or null when new items require an explicit parent. */
  defaultRoot: string | null
  /** Headings appended to every new work-item body. */
  extraSections: string[]
  /** Advisory maximum number of claimed doing cards for dispatchers. */
  maxAgents: number | null
}

export const DEFAULT_VAULT_CONFIG: Readonly<VaultConfig> = {
  workItemFolder: 'Boards',
  defaultRoot: null,
  extraSections: [],
  maxAgents: null,
}

/** Parse at the vault boundary; malformed config must never silently select another folder. */
export function parseVaultConfig(text: string | null): VaultConfig {
  if (text === null) return { ...DEFAULT_VAULT_CONFIG, extraSections: [] }
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
  const sectionsValue = 'extraSections' in value ? value.extraSections : undefined
  const maxAgentsValue = 'maxAgents' in value ? value.maxAgents : undefined
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
  const extraSections: string[] = []
  if (sectionsValue !== undefined) {
    if (!Array.isArray(sectionsValue)) {
      throw new Error(`${WI_CONFIG_FILE}: extraSections must be an array of non-empty, single-line headings.`)
    }
    const headings: unknown[] = sectionsValue
    for (const heading of headings) {
      if (typeof heading !== 'string' || heading.trim() === '' || /[\r\n]/.test(heading)) {
        throw new Error(`${WI_CONFIG_FILE}: extraSections must be an array of non-empty, single-line headings.`)
      }
      extraSections.push(heading)
    }
  }
  let maxAgents: number | null = null
  if (maxAgentsValue !== undefined && maxAgentsValue !== null) {
    if (typeof maxAgentsValue !== 'number' || !Number.isSafeInteger(maxAgentsValue) || maxAgentsValue < 0) {
      throw new Error(`${WI_CONFIG_FILE}: maxAgents must be a non-negative whole number or null.`)
    }
    maxAgents = maxAgentsValue
  }
  return { workItemFolder, defaultRoot, extraSections, maxAgents }
}
