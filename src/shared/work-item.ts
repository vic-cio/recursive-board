/**
 * The text of a new work item.
 *
 * Both writers use this: `wi new` and the board's add row (decision u7). They must produce the
 * same file, because a card created on the phone and a card created by an agent are the same
 * thing. Keeping one renderer is what stops the two drifting.
 *
 * This module imports nothing from Node, so the plugin bundle can carry it to iOS (decision D1).
 */
import { formatScalar, type Scalar } from './frontmatter.ts'
import { WORK_ITEM_TYPE, formatWikilink, type Status } from './schema.ts'
import { renderBody, requireTemplate } from './templates.ts'

export interface NewWorkItem {
  id: string
  title: string
  status: Status
  /** The parent's filename stem. The wikilink is authoritative for resolution (decision D3). */
  parentStem: string
  owner?: string | undefined
  agent?: string | undefined
  priority?: number | undefined
  created: string
  updated: string
  /** A name from the template registry. Omitted uses the default. */
  template?: string | undefined
}

/**
 * Renders a complete work item file.
 * `board` and `prev_status` are never written here: absence is what "not a board" and "never
 * ticked" mean, and writing either would litter the vault with a key that says nothing.
 */
export function renderWorkItem(item: NewWorkItem): string {
  const fields: [string, Scalar][] = [
    ['type', WORK_ITEM_TYPE],
    ['id', item.id],
    ['title', item.title],
    ['status', item.status],
    ['parent', formatWikilink(item.parentStem)],
  ]
  if (item.owner !== undefined && item.owner !== '') fields.push(['owner', item.owner])
  if (item.agent !== undefined && item.agent !== '') fields.push(['agent', item.agent])
  if (item.priority !== undefined) fields.push(['priority', item.priority])
  fields.push(['created', item.created], ['updated', item.updated])

  const frontmatter = fields.map(([key, value]) => `${key}: ${formatScalar(value)}`).join('\n')
  return `---\n${frontmatter}\n---\n\n${renderBody(requireTemplate(item.template))}`
}
