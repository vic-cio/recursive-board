/**
 * The text of a new work item.
 *
 * Both writers use this: `wi new` and the board's add row (docs/adr/0017-inline-status-capture.md). They must produce the
 * same file, because a card created on the phone and a card created by an agent are the same
 * thing. Keeping one renderer is what stops the two drifting.
 *
 * This module imports nothing from Node, so the plugin bundle can carry it to iOS.
 */
import { formatScalar, type Scalar } from './frontmatter.ts'
import { isAnyAgent } from './holder.ts'
import { WORK_ITEM_TYPE, formatWikilink, type Status } from './schema.ts'
import { renderBody, requireTemplate, type Brief } from './templates.ts'

interface NewWorkItemFields {
  id: string
  title: string
  /** The parent's filename stem. The wikilink is authoritative for resolution (docs/adr/0002-work-item-identity-and-parent-links.md). */
  parentStem: string
  owner?: string | undefined
  /** The person or agent who does the work (docs/adr/0061-holder-names-who-does-the-work.md). */
  holder?: string | undefined
  /** Links to a person or role note (docs/adr/0042-creator-and-role.md). */
  creator?: string | undefined
  creatorModel?: string | undefined
  role?: string | undefined
  priority?: number | undefined
  /** Written as a block list, the way Obsidian writes `tags`. */
  tags?: readonly string[] | undefined
  created: string
  updated: string
  /** A name from the template registry. Omitted uses the default. */
  template?: string | undefined
  brief?: Brief | undefined
}

export type NewWorkItem = NewWorkItemFields & (
  | { area: true; status: Status }
  | { area?: false; status: Status }
)

/**
 * New children do not inherit owner. The holder follows active work: it is inherited for doing
 * children, while an explicit owner or holder remains an intentional override. A request for any
 * agent (`holder: agent`) asks for its own card only, so it is not inherited.
 */
export function inheritedChildFields(
  parent: Pick<NewWorkItemFields, 'owner' | 'holder'>,
  status: Status | undefined,
  overrides: Pick<NewWorkItemFields, 'owner' | 'holder'> = {},
): Pick<NewWorkItemFields, 'owner' | 'holder'> {
  const inherited = status === 'doing' && !isAnyAgent(parent.holder) ? parent.holder : undefined
  return {
    owner: overrides.owner,
    holder: overrides.holder ?? inherited,
  }
}

export interface NewRootWorkItem {
  id: string
  title: string
  created: string
  updated: string
}

/**
 * Renders a complete work item file.
 * `board` and `prev_status` are never written here: absence is what "not a board" and "never
 * ticked" mean, and writing either would litter the vault with a key that says nothing.
 */
export function renderWorkItem(item: NewWorkItem, extraSections: readonly string[] = []): string {
  const template = requireTemplate(item.template)
  if (Boolean(template.area) !== (item.area === true)) {
    throw new Error(`template "${template.name}" does not match the work item kind`)
  }
  const fields: [string, Scalar][] = [
    ['type', WORK_ITEM_TYPE],
    ['id', item.id],
    ['title', item.title],
  ]
  fields.push(['status', item.status])
  if (item.area) fields.push(['area', true])
  fields.push(['parent', formatWikilink(item.parentStem)])
  if (item.owner !== undefined && item.owner !== '') fields.push(['owner', item.owner])
  if (item.holder !== undefined && item.holder !== '') fields.push(['holder', item.holder])
  if (item.role !== undefined && item.role !== '') fields.push(['role', item.role])
  if (item.creator !== undefined && item.creator !== '') fields.push(['creator', item.creator])
  if (item.creatorModel !== undefined && item.creatorModel !== '') fields.push(['creator_model', item.creatorModel])
  if (item.priority !== undefined) fields.push(['priority', item.priority])
  fields.push(['created', item.created], ['updated', item.updated])

  const lines = fields.map(([key, value]) => `${key}: ${formatScalar(value)}`)
  if (item.tags !== undefined && item.tags.length > 0) {
    lines.push('tags:', ...item.tags.map((tag) => `  - ${formatScalar(tag)}`))
  }
  return `---\n${lines.join('\n')}\n---\n${renderBody(template, extraSections, item.brief)}`
}

/** Renders a board root. Roots intentionally have neither parent nor status. */
export function renderRootWorkItem(item: NewRootWorkItem, extraSections: readonly string[] = []): string {
  const fields: [string, Scalar][] = [
    ['type', WORK_ITEM_TYPE],
    ['id', item.id],
    ['title', item.title],
    ['created', item.created],
    ['updated', item.updated],
    ['board', true],
  ]
  const frontmatter = fields.map(([key, value]) => `${key}: ${formatScalar(value)}`).join('\n')
  return `---\n${frontmatter}\n---\n${renderBody(requireTemplate(), extraSections)}`
}
