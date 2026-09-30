import { scanMarkdown } from './markdown.ts'

/**
 * Reading one `## Heading` section out of a work item body.
 *
 * An expanded card shows its Objective and its Acceptance Criteria (docs/adr/0016-cards-expand-in-place.md). That is a read,
 * never a write: integrity rule 6 says never to rewrite human-authored body content, so nothing
 * here returns anything the caller could write back.
 */

/** Text under a `## Heading`, up to the next heading of the same or a higher level. */
export function section(body: string, heading: string): string | null {
  const lines = scanMarkdown(body).lines
  const wanted = heading.trim().toLowerCase()
  let start = -1
  let level = 0

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.heading
    if (!match) continue
    if (start === -1) {
      if (match.title.trim().toLowerCase() !== wanted) continue
      start = i + 1
      level = match.level
      continue
    }
    if (match.level <= level) {
      return lines.slice(start, i).map((line) => line.text).join('\n').trim() || null
    }
  }
  return start === -1 ? null : lines.slice(start).map((line) => line.text).join('\n').trim() || null
}

/** The list items under a heading, with their bullet and checkbox markers removed. */
export function listItems(body: string, heading: string): string[] {
  const text = section(body, heading)
  if (text === null) return []
  return text
    .split(/\r?\n/)
    .map((line) => /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line)?.[1]?.trim() ?? '')
    .filter((line) => line !== '')
}

/** A body with its frontmatter removed, so section reading never sees YAML. */
export function bodyOf(text: string): string {
  const match = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  return match ? text.slice(match[0].length) : text
}
