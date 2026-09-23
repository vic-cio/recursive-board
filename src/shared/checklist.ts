/**
 * The generated Markdown for a list of children (docs/adr/0020-generated-markdown-and-note-view.md).
 *
 * The plugin hands this to Obsidian's renderer, so a checklist gets the vault's own typography,
 * task checkboxes and internal links. It lives for one render and reaches no file, which is what
 * keeps it separate from canonical storage: this is rendering only.
 *
 * Rendering risk 4 is the reason this module exists apart from the plugin: text nodes could never
 * become syntax, generated Markdown can. A title is escaped completely, and a path goes in an
 * angle-bracket destination, which takes spaces and parentheses as they are. Neither `<` nor `>`
 * can appear in a work item's filename (`fileNameStem`), so the destination cannot be closed early.
 *
 * Imports nothing, so the plugin bundle can carry it to iOS.
 */

export interface ChecklistLine {
  title: string
  /** Vault path of the work item, with its `.md`. */
  path: string
  done: boolean
}

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/g

/** Makes text inert inline: CommonMark lets a backslash escape any ASCII punctuation mark. */
export function escapeInline(text: string): string {
  return text.replace(/\s+/g, ' ').replace(ASCII_PUNCTUATION, '\\$&')
}

export function checklistMarkdown(lines: readonly ChecklistLine[]): string {
  return lines
    .map((line) => `- [${line.done ? 'x' : ' '}] [${escapeInline(line.title)}](<${line.path}>)`)
    .join('\n')
}
