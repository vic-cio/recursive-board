/** First-run installation for the packaged `wi` CLI. */
import { cp, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { loadVault } from '../vault.ts'
import { hookStatus, installHook } from './hook.ts'

export interface RegistryLocation {
  platform: NodeJS.Platform | string
  home: string
  appData?: string
  /** Test seam for fixture registries. */
  registryPath?: string
}

export function detectObsidianRegistryPath(location: RegistryLocation): string {
  if (location.registryPath) return location.registryPath
  switch (location.platform) {
    case 'darwin':
      return join(location.home, 'Library', 'Application Support', 'obsidian', 'obsidian.json')
    case 'linux':
      return join(location.home, '.config', 'obsidian', 'obsidian.json')
    case 'win32':
      return join(location.appData ?? join(location.home, 'AppData', 'Roaming'), 'obsidian', 'obsidian.json')
    default:
      throw new Error(`wi setup does not know the Obsidian registry location for ${location.platform}.`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function readObsidianVaults(location: RegistryLocation): Promise<string[]> {
  const path = detectObsidianRegistryPath(location)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return []
    throw error
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`cannot read Obsidian vault registry ${path}: invalid JSON.`)
  }
  if (!isRecord(parsed) || !isRecord(parsed['vaults'])) {
    throw new Error(`cannot read Obsidian vault registry ${path}: expected a vaults object.`)
  }

  const paths: string[] = []
  for (const entry of Object.values(parsed['vaults'])) {
    if (!isRecord(entry) || typeof entry['path'] !== 'string' || entry['path'].trim() === '') continue
    const vaultPath = resolve(entry['path'])
    if (!paths.includes(vaultPath)) paths.push(vaultPath)
  }
  return paths
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT'
}

const MANAGED_MARKER = '.recursive-board-managed'
const MANAGED_TEXT = 'Installed by wi setup.\n'

async function installSkillCopy(source: string, destination: string, force: boolean): Promise<'installed' | 'already-installed' | 'dev-link'> {
  let existing
  try {
    existing = await lstat(destination)
  } catch (error) {
    if (!isMissingFile(error)) throw error
  }

  if (existing?.isSymbolicLink()) return 'dev-link'
  if (existing) {
    const managed = existing.isDirectory() && await readFile(join(destination, MANAGED_MARKER), 'utf8')
      .then((value) => value === MANAGED_TEXT)
      .catch(() => false)
    if (!managed && !force) {
      throw new Error(`${destination} already exists and was not installed by wi setup. Read it, then pass --force to replace it.`)
    }
    if (managed) {
      const same = await readFile(join(destination, 'SKILL.md'), 'utf8').catch(() => null)
      const expected = await readFile(join(source, 'SKILL.md'), 'utf8')
      if (same === expected) return 'already-installed'
    }
    await rm(destination, { recursive: true, force: true })
  }

  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, errorOnExist: true, force: false })
  await writeFile(join(destination, MANAGED_MARKER), MANAGED_TEXT, 'utf8')
  return 'installed'
}

async function writeDefaultVault(home: string, vault: string, configHome?: string): Promise<string> {
  const root = resolve(configHome || join(home, '.config'), 'wi')
  const path = join(root, 'config.json')
  let current: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!isRecord(parsed)) throw new Error(`cannot update ${path}: expected a JSON object.`)
    current = parsed
  } catch (error) {
    if (isMissingFile(error)) {
      current = {}
    } else if (error instanceof SyntaxError) {
      throw new Error(`cannot update ${path}: invalid JSON.`)
    } else {
      throw error
    }
  }
  await mkdir(root, { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  await writeFile(temporary, `${JSON.stringify({ ...current, defaultVault: resolve(vault) }, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
  return path
}

async function hasWorkItems(path: string): Promise<boolean> {
  try {
    return (await loadVault(path)).items.length > 0
  } catch {
    return false
  }
}

async function rankVaults(paths: string[]): Promise<Array<{ path: string; hasItems: boolean }>> {
  const ranked = await Promise.all(paths.map(async (path) => ({ path, hasItems: await hasWorkItems(path) })))
  ranked.sort((a, b) => Number(b.hasItems) - Number(a.hasItems) || a.path.localeCompare(b.path))
  return ranked
}

export async function rankObsidianVaults(paths: string[]): Promise<string[]> {
  return (await rankVaults(paths)).map((entry) => entry.path)
}

async function selectVault(vaults: string[]): Promise<string> {
  const ranked = await rankVaults(vaults)
  if (ranked.length === 0) {
    throw new Error('no Obsidian vaults found. Open a vault in Obsidian, or run wi setup --vault <path>.')
  }
  stdout.write('Choose your default Obsidian vault:\n')
  ranked.forEach((entry, index) => stdout.write(`  ${index + 1}. ${entry.path}${entry.hasItems ? ' (work items found)' : ''}\n`))
  const io = createInterface({ input: stdin, output: stdout })
  try {
    for (;;) {
      const answer = (await io.question(`Vault [1-${ranked.length}]: `)).trim()
      const choice = Number(answer)
      if (Number.isInteger(choice) && choice >= 1 && choice <= ranked.length) return ranked[choice - 1]!.path
      stdout.write(`Enter a number from 1 to ${ranked.length}.\n`)
    }
  } finally {
    io.close()
  }
}

async function confirmHook(): Promise<boolean> {
  const io = createInterface({ input: stdin, output: stdout })
  try {
    return /^(y|yes)$/i.test((await io.question('This vault is a Git repository. Install the wi validation hook? [y/N] ')).trim())
  } finally {
    io.close()
  }
}

export interface SetupOptions {
  vault?: string
  yes: boolean
  force: boolean
}

export async function runSetup(options: SetupOptions): Promise<void> {
  if (options.yes && !options.vault) throw new Error('wi setup --yes needs --vault <path> so it can run without questions.')
  const home = homedir()
  const vault = resolve(options.vault ?? await selectVault(await readObsidianVaults({
    platform: platform(), home,
    ...(process.env['APPDATA'] ? { appData: process.env['APPDATA'] } : {}),
  })))
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const skillCandidates = [
    resolve(moduleDir, '..', '..', '..', 'skills', 'recursive-board'),
    resolve(moduleDir, '..', '..', 'skills', 'recursive-board'),
  ]
  let packagedSkill: string | undefined
  for (const candidate of skillCandidates) {
    try {
      await readFile(join(candidate, 'SKILL.md'), 'utf8')
      packagedSkill = candidate
      break
    } catch (error) {
      if (!isMissingFile(error)) throw error
    }
  }
  if (!packagedSkill) throw new Error('the recursive-board skill is missing from this installation.')
  const destinations = [
    join(home, '.claude', 'skills', 'recursive-board'),
    join(home, '.agents', 'skills', 'recursive-board'),
  ]
  const outcomes = await Promise.all(destinations.map((destination) =>
    installSkillCopy(packagedSkill, destination, options.force)))
  const configPath = await writeDefaultVault(home, vault, process.env['XDG_CONFIG_HOME'])

  stdout.write(`wi setup: default vault ${vault}\n`)
  stdout.write(`wi setup: config ${configPath}\n`)
  destinations.forEach((destination, index) => stdout.write(`wi setup: ${outcomes[index]} ${destination}\n`))

  if (!options.yes) {
    const status = await hookStatus(vault)
    if (status.gitRepo && await confirmHook()) {
      const entry = fileURLToPath(import.meta.url)
      const hook = await installHook(vault, entry, false)
      stdout.write(`wi setup: installed validation hook ${hook}\n`)
    }
  }
}
