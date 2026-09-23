/** Builds a throwaway vault on disk, so vault tests exercise real files rather than a fake. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

import { FOLDERS } from '../shared/schema.ts'

export interface Fixture {
  root: string
  write(relPath: string, text: string): string
  cleanup(): void
}

export function makeVault(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'wi-vault-'))
  for (const folder of FOLDERS) mkdirSync(join(root, folder), { recursive: true })
  return {
    root,
    write(relPath, text) {
      const full = join(root, relPath)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, text, 'utf8')
      return full
    },
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
