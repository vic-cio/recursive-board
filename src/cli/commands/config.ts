/** Explicit migration from the hidden legacy file to the synced Markdown config note. */
import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { parseVaultConfigValues } from '../../shared/vault-config.ts'
import { createConfigNote, parseLegacyConfig, VAULT_CONFIG_NOTE } from '../../shared/vault-config-note.ts'

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export async function migrateVaultConfig(root: string, apply: boolean): Promise<void> {
  const notePath = join(root, VAULT_CONFIG_NOTE)
  try {
    await access(notePath)
    throw new Error(`${VAULT_CONFIG_NOTE} already exists. Migration will not overwrite it.`)
  } catch (error) {
    if (!isMissingFile(error)) throw error
  }

  let legacyText: string
  try {
    legacyText = await readFile(join(root, '.wi.json'), 'utf8')
  } catch (error) {
    if (isMissingFile(error)) throw new Error('no .wi.json file exists to migrate.')
    throw error
  }
  const legacyConfig = parseLegacyConfig(legacyText)
  parseVaultConfigValues(legacyConfig, '.wi.json')
  const proposed = createConfigNote(legacyConfig)

  process.stdout.write(`Proposed config note (${VAULT_CONFIG_NOTE}):\n${proposed}`)
  if (!apply) {
    process.stdout.write('Preview only. Run wi config migrate --apply to create the note.\n')
    return
  }

  try {
    await writeFile(notePath, proposed, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (isMissingFile(error)) throw error
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
      throw new Error(`${VAULT_CONFIG_NOTE} already exists. Migration will not overwrite it.`)
    }
    throw error
  }
  process.stdout.write(`Created ${VAULT_CONFIG_NOTE}. Kept .wi.json intact.\n`)
}
