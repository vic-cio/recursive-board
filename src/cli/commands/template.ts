/**
 * `wi template` — list the templates, or write them into a vault.
 *
 * The code is authoritative and `Templates/` is generated from it. That keeps one template
 * rather than two that silently drift, and it keeps the trustworthy path trustworthy: a template
 * read out of the vault could be malformed by a hand edit or a sync conflict, and the CLI would
 * then produce malformed work items from the one component D5 exists to make reliable.
 *
 * The generated files are still real Obsidian templates, so the "Insert template" command works.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { writeAtomic } from '../write.ts'
import { TEMPLATES, renderVaultTemplate, type BodyTemplate } from '../../shared/templates.ts'
import type { Vault } from '../vault.ts'

/** Where a generated template lands. One of the five folders from decision D8. */
export const TEMPLATES_FOLDER = 'Templates'

export interface WrittenTemplate {
  name: string
  relPath: string
  /** What the write did. `unchanged` means the file on disk already matched. */
  outcome: 'created' | 'updated' | 'unchanged'
}

export function listTemplates(): readonly BodyTemplate[] {
  return TEMPLATES
}

/**
 * Writes every template into the vault's `Templates/` folder.
 * A file that already matches is left alone, so this produces no sync event and no Git noise
 * when nothing changed.
 */
export async function writeTemplates(vault: Vault): Promise<WrittenTemplate[]> {
  const folder = join(vault.root, TEMPLATES_FOLDER)
  await mkdir(folder, { recursive: true })

  const written: WrittenTemplate[] = []
  for (const template of TEMPLATES) {
    const path = join(folder, `${template.name}.md`)
    const relPath = `${TEMPLATES_FOLDER}/${template.name}.md`
    const next = renderVaultTemplate(template, vault.config.defaultRoot, vault.config.extraSections)

    if (!existsSync(path)) {
      await writeAtomic(path, next)
      written.push({ name: template.name, relPath, outcome: 'created' })
      continue
    }
    const current = await readFile(path, 'utf8')
    if (current === next) {
      written.push({ name: template.name, relPath, outcome: 'unchanged' })
      continue
    }
    await writeAtomic(path, next)
    written.push({ name: template.name, relPath, outcome: 'updated' })
  }
  return written
}
