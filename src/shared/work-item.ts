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
import { WORK_ITEM_TYPE, formatWikilink, type Status } from './schema.ts'
import { renderBody, requireTemplate } from './templates.ts'

interface NewWorkItemFields {
  id: string
  title: string
  /** The parent's filename stem. The wikilink is authoritative for resolution (docs/adr/0002-work-item-identity-and-parent-links.md). */
  parentStem: string
  owner?: string | undefined
  agent?: string | undefined
  priority?: number | undefined
  created: string
  updated: string
  /** A name from the template registry. Omitted uses the default. */
  template?: string | undefined
}

export type NewWorkItem = NewWorkItemFields & (
  | { area: true; status: Status }
  | { area?: false; status: Status }
)

/**
 * New children keep their owner's assignment. Agent assignment follows active work: it is
 * inherited for doing children, while an explicit agent remains an intentional override.
 */
export function inheritedChildFields(
  parent: Pick<NewWorkItemFields, 'owner' | 'agent'>,
  status: Status | undefined,
  overrides: Pick<NewWorkItemFields, 'owner' | 'agent'> = {},
): Pick<NewWorkItemFields, 'owner' | 'agent'> {
  return {
    owner: overrides.owner ?? parent.owner,
    agent: overrides.agent ?? (status === 'doing' ? parent.agent : undefined),
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
  if (item.agent !== undefined && item.agent !== '') fields.push(['agent', item.agent])
  if (item.priority !== undefined) fields.push(['priority', item.priority])
  fields.push(['created', item.created], ['updated', item.updated])

  const frontmatter = fields.map(([key, value]) => `${key}: ${formatScalar(value)}`).join('\n')
  return `---\n${frontmatter}\n---\n\n${renderBody(template, extraSections)}`
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
  return `---\n${frontmatter}\n---\n\n${renderBody(requireTemplate(), extraSections)}`
}
