/**
 * The body templates a new work item can be created from.
 *
 * The code is authoritative and the vault's `Templates/` folder is generated from it, by
 * `wi template write`. That direction was chosen over reading the vault's file because the CLI is
 * the shared component used by both writers so the integrity rules live in tested code: a template read
 * from the vault could be malformed by a hand edit or a sync conflict, and would then produce
 * malformed work items from the one path that is supposed to be trustworthy.
 *
 * Adding a board type is a data change. Append an entry to TEMPLATES, run `wi template write`,
 * and `wi new --template <name>` works. Nothing else has to change.
 *
 * This module imports nothing from Node, so the plugin bundle carries it to iOS.
 */
import { formatScalar } from './frontmatter.ts'
import { CORE_FIELDS, WORK_ITEM_TYPE, formatWikilink } from './schema.ts'
import { wrapAnglePlaceholders } from './markdown.ts'

export interface Section {
  heading: string
  /** A starter line under the heading, such as an empty bullet. Omitted leaves the section bare. */
  starter?: string
}

export interface BodyTemplate {
  name: string
  /** One line, shown by `wi template list`. */
  description: string
  sections: Section[]
  /** Area templates create ongoing spaces, which have no status column. */
  area?: boolean
}

/**
 * Every template. The frontmatter is the frozen v1 schema and does not vary: a template chooses
 * what a work item's body prompts you for, never what fields it carries.
 */
export const TEMPLATES: readonly BodyTemplate[] = [
  {
    name: 'work-item',
    description: 'The default. What every work item starts as.',
    sections: [
      { heading: 'Objective' },
      { heading: 'Context' },
      { heading: 'Acceptance Criteria' },
      { heading: 'Notes' },
    ],
  },
  {
    name: 'first-board-card',
    description: 'A short guide to adding and moving cards on your first board.',
    sections: [
      { heading: 'Getting started', starter: 'Add cards from a board column. Use Promote at the top of this card to give it its own board. To move this card, open its card menu and choose “Move to…”.' },
      { heading: 'Notes' },
    ],
  },
  {
    name: 'area',
    description: 'An ongoing area of work.',
    area: true,
    sections: [
      { heading: 'Objective' },
      { heading: 'Context' },
      { heading: 'Notes' },
    ],
  },
]

export const DEFAULT_TEMPLATE = 'work-item'

export function templateNames(): string[] {
  return TEMPLATES.map((t) => t.name)
}

export function findTemplate(name: string): BodyTemplate | undefined {
  return TEMPLATES.find((t) => t.name === name)
}

/**
 * Resolves a template name, or throws with the list of names that exist.
 * The error names them because a typo here is otherwise silent: you get the default body.
 */
export function requireTemplate(name: string = DEFAULT_TEMPLATE): BodyTemplate {
  const template = findTemplate(name)
  if (template) return template
  throw new Error(`no template called "${name}". There is: ${templateNames().join(', ')}.`)
}

/**
 * What a new work item is for, given at creation so one command writes a complete card.
 * An agent that must edit the file afterwards often skips the edit and leaves an empty card.
 */
export interface Brief {
  objective?: string | undefined
  /** One paragraph each. */
  context?: readonly string[] | undefined
  /** One list item each. */
  criteria?: readonly string[] | undefined
}

const BRIEF_HEADINGS = { objective: 'Objective', context: 'Context', criteria: 'Acceptance Criteria' } as const

/** The brief sections a template has and the brief leaves empty. Only Objective and criteria count. */
export function briefGaps(template: BodyTemplate, brief: Brief = {}): string[] {
  const headings = new Set(template.sections.map((s) => s.heading))
  const gaps: string[] = []
  if (headings.has(BRIEF_HEADINGS.objective) && !brief.objective?.trim()) gaps.push(BRIEF_HEADINGS.objective)
  if (headings.has(BRIEF_HEADINGS.criteria) && !brief.criteria?.some((c) => c.trim() !== '')) {
    gaps.push(BRIEF_HEADINGS.criteria)
  }
  return gaps
}

function briefContent(brief: Brief): Map<string, string> {
  const content = new Map<string, string>()
  const objective = brief.objective?.trim()
  if (objective) content.set(BRIEF_HEADINGS.objective, wrapAnglePlaceholders(objective))
  const context = (brief.context ?? []).map((c) => c.trim()).filter((c) => c !== '')
  if (context.length > 0) content.set(BRIEF_HEADINGS.context, wrapAnglePlaceholders(context.join('\n\n')))
  const criteria = (brief.criteria ?? []).map((c) => c.trim()).filter((c) => c !== '')
  for (const line of criteria) {
    if (/[\r\n]/.test(line)) throw new Error('each acceptance criterion must be one line.')
  }
  if (criteria.length > 0) content.set(BRIEF_HEADINGS.criteria, wrapAnglePlaceholders(criteria.map((c) => `- ${c}`).join('\n')))
  return content
}

/**
 * The body of a new work item.
 *
 * There is no `# Title` heading. Obsidian draws the filename as an inline title above the body,
 * so an H1 repeating it puts the same words on screen twice. The filename is the title.
 * A brief fills its sections in place of their starter lines. A brief for a section the template
 * lacks is refused, so the text is never dropped.
 */
export function renderBody(
  template: BodyTemplate,
  extraSections: readonly string[] = [],
  brief: Brief = {},
): string {
  const content = briefContent(brief)
  const sections: Section[] = [
    ...template.sections,
    ...extraSections.map((heading) => ({ heading })),
  ]
  for (const heading of content.keys()) {
    if (!sections.some((s) => s.heading === heading)) {
      throw new Error(`template "${template.name}" has no ${heading} section.`)
    }
  }
  const parts: string[] = []
  for (const section of sections) {
    parts.push(`## ${section.heading}`, '')
    const filled = content.get(section.heading) ?? section.starter
    if (filled !== undefined) parts.push(filled, '')
  }
  return parts.join('\n')
}

/**
 * The file written to `Templates/<name>.md`.
 *
 * It carries placeholder frontmatter so Obsidian's own template insert produces something
 * `wi validate` can then complain about precisely, rather than something that looks valid and is
 * not. `board` and `prev_status` are left out: absence is what "not a board" and "never ticked"
 * mean, and a template should not teach you to write either.
 */
export function renderVaultTemplate(
  template: BodyTemplate,
  defaultRoot: string | null = null,
  extraSections: readonly string[] = [],
): string {
  const placeholders: Record<string, string> = {
    type: formatScalar(WORK_ITEM_TYPE),
    id: 'wi-XXXX',
    title: '',
    parent: defaultRoot === null ? '' : formatScalar(formatWikilink(defaultRoot)),
    created: '',
    updated: '',
  }
  placeholders['status'] = 'backlog'
  if (template.area) placeholders['area'] = 'true'
  const fields = CORE_FIELDS
  const lines = fields.filter((field) => field in placeholders).map(
    (field) => `${field}: ${placeholders[field]}`.trimEnd(),
  )
  if (template.area) lines.splice(4, 0, 'area: true')
  return `---\n${lines.join('\n')}\n---\n\n${renderBody(template, extraSections)}`
}
