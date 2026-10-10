/**
 * `wi new` — create a work item.
 *
 * This is the decomposition path: an agent that finds a work item too large creates children
 * rather than writing a plan into a chat transcript. It is also the board's add row (docs/adr/0017-inline-status-capture.md),
 * which is why a status can be given and why the assignee follows the shared status rule.
 */

import { editItem } from '../edit-item.ts'
import { isPathExists } from '../storage.ts'
import { cardState } from '../card-state.ts'
import { assigneesIn } from '../assignee.ts'
import { inheritedChildFields, renderWorkItem, type NewWorkItem } from '../work-item.ts'
import { briefGaps, renderBody, requireTemplate, type Brief } from '../templates.ts'
import { firstChildPromotion } from '../transitions.ts'
import { asName } from '../authorship.ts'
import { freeTag, withFreeTag } from '../tags.ts'
import { fileNameFor, fileNameStem, isStatus, newId, today, WORK_ITEM_TYPE, type Status } from '../schema.ts'
import { parseFrontmatter } from '../frontmatter.ts'
import type { Vault } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { json } from './output.ts'

export interface NewOptions {
  title: string
  /** An id, a filename or a title. Required: only the root has no parent. */
  parent?: string
  status?: Status
  owner?: string
  /** The person or agent who does the work. `wi new --assignee` sets it. */
  assignee?: string
  /** Free tags, such as a role tag `role/checker` (docs/adr/0062-role-tags.md). */
  tags?: string[]
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
  if (template.area && options.assignee?.trim()) {
    throw new Error('areas cannot have an assignee')
  }

  const parent = vault.resolve(parentRef)
  const gaps = briefGaps(template, options.brief)
  if (options.strict && gaps.length > 0) {
    throw new Error(`the card has no ${gaps.join(' or ')}. Pass --objective and --criteria, or drop --strict.`)
  }
  // Render the body first, so a brief the template cannot hold fails before a file exists.
  renderBody(template, vault.config.extraSections, options.brief)

  const stamp = today(vault.seams.now())
  const inherited = inheritedChildFields({
    assignees: template.area ? undefined : assigneesIn(parent.text),
  }, status, {
    owner: options.owner,
    // An empty --assignee gives the card no assignee, so it inherits none.
    assignees: options.assignee === undefined ? undefined : [options.assignee.trim()].filter((name) => name !== ''),
  })
  const tags = newTags(options.tags ?? [])
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
    if (tags.length > 0) fields.tags = tags
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
  for (let attempt = 0; ; attempt++) {
    id = newId(takenIds, vault.seams.random)
    stem = fileNameFor(title, id, takenStems)
    relPath = `${vault.config.workItemFolder}/${stem}.md`
    try {
      await vault.port.create(relPath, render(id))
      break
    } catch (error) {
      if (!isPathExists(error)) throw error
      const existing = await vault.port.read(relPath).catch(() => '')
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
  await editItem(vault, parent, (text) => {
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
    id, stem, relPath, parentStem: parent.stem,
    promotedParent, gaps, renamed: stem !== fileNameStem(title),
  }
}

/** Each tag once, as `wi tag` would store it. Throws before any write for a tag `wi tag` refuses. */
function newTags(inputs: readonly string[]): string[] {
  let tags: string[] = []
  for (const input of inputs) tags = withFreeTag(tags, freeTag(input), true)
  return tags
}

/** `wi new <title> --parent <ref>`: what it prints, from the item createItem made. */
export const runNew: RunFunction = async (context, line) => {
  const vault = await context.vault()
  const { values } = line
  const title = line.positionals.slice(1).join(' ').trim()
  if (title === '') throw new UsageError('wi new needs a title. Try: wi new "Build server" --parent Main')

  const explicitParent = typeof values['parent'] === 'string' ? values['parent'] : undefined
  const parent = explicitParent ?? vault.config.defaultRoot
  if (!parent) throw new UsageError('wi new needs --parent <ref>, or a defaultRoot in the board settings.')

  const priority = typeof values['priority'] === 'string' ? Number(values['priority']) : undefined
  if (priority !== undefined && !Number.isFinite(priority)) {
    throw new UsageError(`--priority must be a number, not "${values['priority']}".`)
  }

  const created = await createItem(vault, {
    title,
    parent,
    ...(typeof values['status'] === 'string' ? { status: values['status'] as never } : {}),
    ...(typeof values['owner'] === 'string' ? { owner: values['owner'] } : {}),
    ...(typeof values['assignee'] === 'string' ? { assignee: values['assignee'] }
      : typeof values['holder'] === 'string' ? { assignee: values['holder'] } : {}),
    ...(typeof values['template'] === 'string' ? { template: values['template'] } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(Array.isArray(values['tag']) ? { tags: values['tag'] } : {}),
    brief: {
      objective: typeof values['objective'] === 'string' ? values['objective'] : undefined,
      context: Array.isArray(values['context']) ? values['context'] : undefined,
      criteria: Array.isArray(values['criteria']) ? values['criteria'] : undefined,
    },
    strict: values['strict'] === true,
  })

  if (vault.unaccounted.length > 0) {
    context.err(
      `wi: warning: a new id or filename may clash with an unread file. ` +
      `Unread files: ${vault.unaccounted.join(', ')}.\n`,
    )
  }

  if (created.gaps.length > 0) {
    context.err(`wi: warning: ${created.id} has no ${created.gaps.join(' or ')}. ` +
      `Pass --objective and --criteria, or fill the card before work starts.\n`)
  }
  if (created.renamed) {
    context.err(`wi: note: another item has this filename, so this one is ${created.relPath}. ` +
      `If they are different work, give the card a more specific title.\n`)
  }

  if (values['json'] === true) {
    context.out(json({ id: created.id, path: created.relPath, parent: created.parentStem,
      promoted_parent: created.promotedParent, gaps: created.gaps }))
  } else {
    context.out(`${created.id}  ${created.relPath}  (child of ${created.parentStem})\n`)
    if (created.promotedParent) context.out(`${created.parentStem}  promoted to a board (its first child)\n`)
  }
  return 0
}
