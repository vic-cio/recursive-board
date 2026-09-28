/**
 * `wi new` — create a work item.
 *
 * This is the decomposition path: an agent that finds a work item too large creates children
 * rather than writing a plan into a chat transcript. It is also the board's add row (docs/adr/0017-inline-status-capture.md),
 * which is why a status can be given and why `owner` and `agent` are inherited.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { editItem, writeAtomic } from '../write.ts'
import { inheritedChildFields, renderWorkItem, type NewWorkItem } from '../../shared/work-item.ts'
import { briefGaps, renderBody, requireTemplate, type Brief } from '../../shared/templates.ts'
import { firstChildPromotion } from '../../shared/transitions.ts'
import { areaTagFor } from '../../shared/area-tags.ts'
import { chainOf } from './retag.ts'
import { asLink } from '../../shared/authorship.ts'
import { fileNameFor, fileNameStem, isStatus, newId, today, type Status } from '../../shared/schema.ts'
import type { Vault } from '../vault.ts'

export interface NewOptions {
  title: string
  /** An id, a filename or a title. Required: only the root has no parent. */
  parent?: string
  status?: Status
  owner?: string
  agent?: string
  /** The person or role that makes the card, as a name or a link (docs/adr/0042-creator-and-role.md). */
  creator?: string
  /** The model id, when an agent makes the card. */
  model?: string
  /** The role that must do the work. */
  role?: string
  priority?: number
  /** A name from the template registry. Omitted uses the default. */
  template?: string
  brief?: Brief
  /** Refuse to create a card whose template asks for an Objective or criteria the brief lacks, or that has no creator. */
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
  /** True when the card has no creator. */
  uncredited: boolean
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
  const gaps = briefGaps(template, options.brief)
  if (options.strict && gaps.length > 0) {
    throw new Error(`the card has no ${gaps.join(' or ')}. Pass --objective and --criteria, or drop --strict.`)
  }
  const creator = options.creator?.trim() ? asLink(options.creator) : undefined
  if (options.strict && creator === undefined) {
    throw new Error('the card has no creator. Pass --creator, or set WI_CREATOR, or drop --strict.')
  }
  // Render the body first, so a brief the template cannot hold fails before a file exists.
  renderBody(template, vault.config.extraSections, options.brief)

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
    brief: options.brief,
  }
  const inherited = inheritedChildFields({
    owner: textField(parent.frontmatter.get('owner')),
    agent: textField(parent.frontmatter.get('agent')),
  }, status, options)
  const fields: NewWorkItem = template.area
    ? { ...common, ...inherited, area: true, status }
    : { ...common, ...inherited, status }
  if (options.priority !== undefined) fields.priority = options.priority
  if (creator !== undefined) fields.creator = creator
  if (creator !== undefined && options.model?.trim()) fields.creatorModel = options.model.trim()
  if (options.role?.trim()) fields.role = asLink(options.role)
  // An owner becomes a link when a note of that name exists; plain text stays for vaults without person notes.
  if (fields.owner !== undefined && options.owner !== undefined && await vault.resolveNote(options.owner) !== undefined) {
    fields.owner = asLink(options.owner)
  }
  const areaTag = vault.config.areaTags
    ? areaTagFor([{ title, area: template.area === true }, ...chainOf(vault, parent)])
    : null
  if (areaTag !== null) fields.tags = [areaTag]

  await writeAtomic(path, renderWorkItem(fields, vault.config.extraSections))

  // A second file write, after the child exists: see docs/adr/0035-promote-a-parent-on-its-first-child.md.
  const promotion = firstChildPromotion({
    isRoot: parent.parent === null && !parent.frontmatter.has('parent'),
    area: parent.area,
    hasBoardKey: parent.frontmatter.has('board'),
    childCount: vault.childrenOf(parent).length,
  }, vault.config.autoPromote)
  if (promotion) await editItem(parent, promotion)

  return {
    id, stem, relPath, path, parentStem: parent.stem,
    promotedParent: promotion !== null, gaps, renamed: stem !== fileNameStem(title),
    uncredited: creator === undefined,
  }
}

function textField(value: string | number | boolean | null | undefined): string | undefined {
  return value === undefined || value === null ? undefined : String(value)
}
