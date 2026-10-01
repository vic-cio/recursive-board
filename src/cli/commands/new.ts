/**
 * `wi new` — create a work item.
 *
 * This is the decomposition path: an agent that finds a work item too large creates children
 * rather than writing a plan into a chat transcript. It is also the board's add row (docs/adr/0017-inline-status-capture.md),
 * which is why a status can be given and why the holder follows the shared status rule.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { editItem, writeNew } from '../write.ts'
import { cardState } from '../../shared/card-state.ts'
import { holderOf } from '../../shared/holder.ts'
import { inheritedChildFields, renderWorkItem, type NewWorkItem } from '../../shared/work-item.ts'
import { briefGaps, renderBody, requireTemplate, type Brief } from '../../shared/templates.ts'
import { firstChildPromotion } from '../../shared/transitions.ts'
import { asName } from '../../shared/authorship.ts'
import { fileNameFor, fileNameStem, isStatus, newId, today, WORK_ITEM_TYPE, type Status } from '../../shared/schema.ts'
import { parseFrontmatter } from '../../shared/frontmatter.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface NewOptions {
  title: string
  /** An id, a filename or a title. Required: only the root has no parent. */
  parent?: string
  status?: Status
  owner?: string
  /** The person or agent who does the work. `wi new --agent` sets it. */
  holder?: string
  /** The role that must do the work. */
  role?: string
  priority?: number
  /** A name from the template registry. Omitted uses the default. */
  template?: string
  brief?: Brief
  /** Refuse to create a card whose template asks for an Objective or criteria the brief lacks. */
  strict?: boolean
}

export interface Created {
  id: string
  stem: string
  relPath: string
  path: string
  parentStem: string
  /** True when this child was the parent's first and the parent became a board. */
  promotedParent: boolean
  /** Brief sections the template asks for and the card leaves empty. */
  gaps: string[]
  /** True when another item took the plain filename, so the file carries the id suffix. */
  renamed: boolean
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
  if (template.area && options.holder?.trim()) {
    throw new Error('areas cannot have a holder')
  }

  const parent = vault.resolve(parentRef)
  const gaps = briefGaps(template, options.brief)
  if (options.strict && gaps.length > 0) {
    throw new Error(`the card has no ${gaps.join(' or ')}. Pass --objective and --criteria, or drop --strict.`)
  }
  // Render the body first, so a brief the template cannot hold fails before a file exists.
  renderBody(template, vault.config.extraSections, options.brief)

  const stamp = today()
  const inherited = inheritedChildFields({
    holder: template.area ? undefined : holderOf((key) => parent.frontmatter.get(key)),
  }, status, options)
  const role = options.role?.trim() ? asName(options.role) : undefined
  const render = (id: string): string => {
    const common = {
      id,
      title,
      parentStem: parent.stem,
      created: stamp,
      updated: stamp,
      template: options.template,
      brief: options.brief,
    }
    const fields: NewWorkItem = template.area
      ? { ...common, ...inherited, area: true, status }
      : { ...common, ...inherited, status }
    if (options.priority !== undefined) fields.priority = options.priority
    if (role !== undefined) fields.role = role
    if (options.owner?.trim()) fields.owner = asName(options.owner)
    return renderWorkItem(fields, vault.config.extraSections)
  }

  // The file is created only if its path is free at the moment of writing, never renamed over
  // one (docs/adr/0054-edits-from-the-file-at-write-time.md). A work item at the path is a card
  // another process made since the load, so the next try takes the id-suffixed name. Any other
  // file at the path is the owner's, and the create is refused.
  const takenIds = new Set(vault.takenIds)
  const takenStems = new Set(vault.takenStems)
  let id = ''
  let stem = ''
  let relPath = ''
  let path = ''
  for (let attempt = 0; ; attempt++) {
    id = newId(takenIds)
    stem = fileNameFor(title, id, takenStems)
    relPath = `${vault.config.workItemFolder}/${stem}.md`
    path = join(vault.root, ...vault.config.workItemFolder.split('/'), `${stem}.md`)
    try {
      await writeNew(path, render(id))
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const existing = await readFile(path, 'utf8').catch(() => '')
      if (attempt >= 4 || parseFrontmatter(existing)?.get('type') !== WORK_ITEM_TYPE) {
        throw new Error(`${relPath} already exists. Refusing to overwrite it.`)
      }
      takenIds.add(id)
      takenStems.add(stem.toLowerCase())
    }
  }

  // A second file write, after the child exists: see docs/adr/0035-promote-a-parent-on-its-first-child.md.
  // The board key is read under the lock; the child count comes from the loaded vault.
  let promotedParent = false
  await editItem(parent, (text) => {
    const promotion = firstChildPromotion({
      isRoot: parent.parent === null && !parent.frontmatter.has('parent'),
      area: cardState(text).area,
      hasBoardKey: cardState(text).hasBoardKey,
      childCount: vault.childrenOf(parent).length,
    }, vault.config.autoPromote)
    promotedParent = promotion !== null
    return promotion
  })

  return {
    id, stem, relPath, path, parentStem: parent.stem,
    promotedParent, gaps, renamed: stem !== fileNameStem(title),
  }
}

/** The `role` of the item and each ancestor, nearest first. */
export function ancestorRoles(vault: Vault, parent: WorkItem): unknown[] {
  const roles: unknown[] = []
  const seen = new Set<string>()
  for (let current: WorkItem | undefined = parent; current; current = vault.resolveLink(current.parent)) {
    if (seen.has(current.relPath)) break
    seen.add(current.relPath)
    roles.push(current.frontmatter.get('role'))
  }
  return roles
}
