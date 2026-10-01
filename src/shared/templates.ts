/**
 * The body templates a new work item can be created from.
 *
 * The templates stay in code. `wi new` and the plugin use the shared renderer so both writers
 * create the same body and apply the same integrity rules.
 *
 * Adding a board type is a data change. Append an entry to TEMPLATES, then use it with
 * `wi new --template <name>`.
 *
 * This module imports nothing from Node, so the plugin bundle carries it to iOS.
 */
import { wrapAnglePlaceholders } from './markdown.ts'

export interface Section {
  heading: string
  /** A starter line under the heading, such as an empty bullet. Omitted leaves the section bare. */
  starter?: string
}

export interface BodyTemplate {
  name: string
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
    sections: [
      { heading: 'Objective' },
      { heading: 'Context' },
      { heading: 'Acceptance Criteria' },
      { heading: 'Notes' },
    ],
  },
  {
    name: 'first-board-card',
    sections: [
      { heading: 'Getting started', starter: 'Add cards from a board column. Use Promote at the top of this card to give it its own board. To move this card, open its card menu and choose “Move to…”.' },
      { heading: 'Notes' },
    ],
  },
  {
    name: 'area',
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
