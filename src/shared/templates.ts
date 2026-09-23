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
      { heading: 'Acceptance Criteria', starter: '- ' },
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
 * The body of a new work item.
 *
 * There is no `# Title` heading. Obsidian draws the filename as an inline title above the body,
 * so an H1 repeating it puts the same words on screen twice. The filename is the title.
 */
export function renderBody(template: BodyTemplate, extraSections: readonly string[] = []): string {
  const parts: string[] = []
  const sections: Section[] = [
    ...template.sections,
    ...extraSections.map((heading) => ({ heading, starter: '- ' })),
  ]
  for (const section of sections) {
    parts.push(`## ${section.heading}`, '')
    if (section.starter !== undefined) parts.push(section.starter, '')
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
    status: 'backlog',
    parent: defaultRoot === null ? '' : formatScalar(formatWikilink(defaultRoot)),
    created: '',
    updated: '',
  }
  const lines = CORE_FIELDS.filter((field) => field in placeholders).map(
    (field) => `${field}: ${placeholders[field]}`.trimEnd(),
  )
  return `---\n${lines.join('\n')}\n---\n\n${renderBody(template, extraSections)}`
}
