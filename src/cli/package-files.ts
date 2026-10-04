/**
 * Files that ship in the npm package: the playbook, the changelog, the skill.
 *
 * This module sits two folders below the package root both in the source (`src/cli/`) and in the
 * bundle (`dist/wi/`), so one relative path finds the root in a checkout and in an install.
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/** The text of a package file, by its path from the package root, or null when it is missing. */
export async function readPackageFile(path: string): Promise<string | null> {
  try {
    return await readFile(resolve(packageRoot(), path), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
