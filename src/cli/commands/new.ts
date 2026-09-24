/**
 * `wi new` — create a work item.
 *
 * This is the decomposition path: an agent that finds a work item too large creates children
 * rather than writing a plan into a chat transcript. It is also the board's add row (docs/adr/0017-inline-status-capture.md),
 * which is why a status can be given and why `owner` and `agent` are inherited.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { writeAtomic } from '../write.ts'
import { inheritedChildFields, renderWorkItem, type NewWorkItem } from '../../shared/work-item.ts'
import { requireTemplate } from '../../shared/templates.ts'
import { fileNameFor, isStatus, newId, today, type Status } from '../../shared/schema.ts'
import type { Vault } from '../vault.ts'

export interface NewOptions {
  title: string
  /** An id, a filename or a title. Required: only the root has no parent. */
  parent?: string
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
  const parentRef = options.parent ?? vault.config.defaultRoot ?? ''
  if (parentRef.trim() === '') {
    throw new Error('a work item needs a --parent. Only the root has none.')
  }

  // Resolve the template before anything is written, so a bad name fails before a file exists.
  const template = requireTemplate(options.template)
  const status = options.status ?? 'backlog'
  if (!isStatus(status)) {
    throw new Error(`"${status}" is not a status. Use backlog, options, doing or done.`)
  }

  const parent = vault.resolve(parentRef)

  const id = newId(vault.takenIds)
  const stem = fileNameFor(title, id, vault.takenStems)
  const relPath = `${vault.config.workItemFolder}/${stem}.md`
  const path = join(vault.root, ...vault.config.workItemFolder.split('/'), `${stem}.md`)
  if (existsSync(path)) {
    throw new Error(`${relPath} already exists. Refusing to overwrite it.`)
  }

  const stamp = today()
  const common = {
    id,
    title,
    parentStem: parent.stem,
    created: stamp,
    updated: stamp,
    template: options.template,
  }
  const inherited = inheritedChildFields({
    owner: textField(parent.frontmatter.get('owner')),
    agent: textField(parent.frontmatter.get('agent')),
  }, status, options)
  const fields: NewWorkItem = template.area
    ? { ...common, ...inherited, area: true, status }
    : { ...common, ...inherited, status }
  if (options.priority !== undefined) fields.priority = options.priority

  await writeAtomic(path, renderWorkItem(fields, vault.config.extraSections))

  return { id, stem, relPath, path, parentStem: parent.stem }
}

function textField(value: string | number | boolean | null | undefined): string | undefined {
  return value === undefined || value === null ? undefined : String(value)
}
