/**
 * `wi new` — create a work item.
 *
 * This is the decomposition path: an agent that finds a work item too large creates children
 * rather than writing a plan into a chat transcript. It is also the board's add row (decision u7),
 * which is why a status can be given and why `owner` and `agent` are inherited.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { writeAtomic } from '../write.ts'
import { renderWorkItem, type NewWorkItem } from '../../shared/work-item.ts'
import { requireTemplate } from '../../shared/templates.ts'
import {
  BOARDS, INHERITED_FIELDS, fileNameFor, isStatus, newId, today, type Status,
} from '../../shared/schema.ts'
import type { Vault } from '../vault.ts'

export interface NewOptions {
  title: string
  /** An id, a filename or a title. Required: only the root has no parent. */
  parent: string
  status?: Status
  owner?: string
  agent?: string
  priority?: number
  /** A name from the template registry. Omitted uses the default. */
  template?: string
}

export interface Created {
  id: string
  stem: string
  relPath: string
  path: string
  parentStem: string
}

export async function createItem(vault: Vault, options: NewOptions): Promise<Created> {
  const title = options.title.trim()
  if (title === '') throw new Error('a work item needs a title')
  if (options.parent.trim() === '') {
    throw new Error('a work item needs a --parent. Only the root has none.')
  }

  // Resolve the template before anything is written, so a bad name fails before a file exists.
  requireTemplate(options.template)

  const status = options.status ?? 'backlog'
  if (!isStatus(status)) {
    throw new Error(`"${status}" is not a status. Use backlog, options, doing or done.`)
  }

  const parent = vault.resolve(options.parent)

  const id = newId(vault.takenIds)
  const stem = fileNameFor(title, id, vault.takenStems)
  const relPath = `${BOARDS}/${stem}.md`
  const path = join(vault.root, BOARDS, `${stem}.md`)
  if (existsSync(path)) {
    throw new Error(`${relPath} already exists. Refusing to overwrite it.`)
  }

  const stamp = today()
  const fields: NewWorkItem = {
    id,
    title,
    status,
    parentStem: parent.stem,
    created: stamp,
    updated: stamp,
    template: options.template,
  }

  for (const field of INHERITED_FIELDS) {
    // Absence is meaningful: never write a key the parent did not carry.
    const value = options[field] ?? parent.frontmatter.get(field)
    if (value !== undefined && value !== '') fields[field] = String(value)
  }
  if (options.priority !== undefined) fields.priority = options.priority

  await writeAtomic(path, renderWorkItem(fields))

  return { id, stem, relPath, path, parentStem: parent.stem }
}
