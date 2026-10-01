/** Builds a throwaway vault on disk, so vault tests exercise real files rather than a fake. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

import { FOLDERS } from '../shared/schema.ts'
import { PLUGIN_DATA_FILE } from '../shared/board-settings.ts'

export interface Fixture {
  root: string
  write(relPath: string, text: string): string
  /** Writes the board settings, a JSON object as text, under the board key of the plugin data file. */
  writeSettings(board: string): string
  cleanup(): void
}

export function makeVault(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'wi-vault-'))
  for (const folder of FOLDERS) mkdirSync(join(root, folder), { recursive: true })
  const write = (relPath: string, text: string): string => {
    const full = join(root, relPath)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text, 'utf8')
    return full
  }
  return {
    root,
    write,
    writeSettings: (board) => write(PLUGIN_DATA_FILE, `{"board":${board}}\n`),
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}

/** A work item file, written the way `wi new` writes one. */
export function item(fields: Record<string, string | number | boolean>, body = ''): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join('\n')}\n---\n\n${body}`
}
