/**
 * Where wi finds a vault, and the vault index over the Node port.
 *
 * The index itself lives in `shared/vault.ts`, read through a storage port, so the plugin builds
 * the same one (docs/adr/0076-a-storage-port-and-a-command-runner.md). This module keeps what
 * only wi needs: the walk up to a vault root, the configured default vault, and the user config
 * folder. The loaders here take a root folder and wrap it in the Node port.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve as resolvePath, dirname, isAbsolute } from 'node:path'

import { PLUGIN_DATA_FILE } from '../shared/board-settings.ts'
import { BOARDS } from '../shared/schema.ts'
import type { TaggedNote } from '../shared/role-tags.ts'
import * as shared from '../shared/vault.ts'
import { nodePort } from './node-port.ts'

export {
  maxAgentsForRun, NOT_NOTES, requireAccountedTree,
  type Env, type Vault, type VaultSeams, type WorkItem,
} from '../shared/vault.ts'

/** The user config folder `wi setup` writes: `$XDG_CONFIG_HOME/wi` when absolute, else `~/.config/wi`. */
export function wiConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env['XDG_CONFIG_HOME']
  return xdg && isAbsolute(xdg) ? join(xdg, 'wi') : join(homedir(), '.config', 'wi')
}

async function readJsonObject(path: string, description: string): Promise<Record<string, unknown> | null> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`${description} must contain valid JSON.`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${description} must contain a JSON object.`)
  }
  return value as Record<string, unknown>
}

/** Reads the fallback vault configured by `wi setup`, respecting XDG_CONFIG_HOME. */
export async function getDefaultVault(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const config = await readJsonObject(join(wiConfigDir(env), 'config.json'), 'wi config.json')
  return typeof config?.['defaultVault'] === 'string' ? config['defaultVault'] : null
}

/** Walks up to the vault the folder is in: the nearest one with plugin data or `Boards/`. */
export function findVaultRoot(start: string): string | null {
  let dir = resolvePath(start)
  for (;;) {
    if (existsSync(join(dir, PLUGIN_DATA_FILE)) || existsSync(join(dir, BOARDS))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** The vault index of the vault at `root`, read through the Node port. */
export function loadVault(root: string, seams?: shared.VaultSeams): Promise<shared.Vault> {
  return shared.loadVault(nodePort(root), seams)
}

/** Every note in the vault at `root` with a role tag (docs/adr/0062-role-tags.md). */
export function readRoleTaggedNotes(root: string): Promise<TaggedNote[]> {
  return shared.readRoleTaggedNotes(nodePort(root))
}

/** The people the vault at `root` knows (docs/adr/0083-assign-and-several-holders.md). */
export function readPeople(root: string): Promise<Map<string, string>> {
  return shared.readPeople(nodePort(root))
}
