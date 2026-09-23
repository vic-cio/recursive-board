import { frontmatterBody } from './frontmatter.ts'

interface Heading { level: number; title: string; start: number; end: number }

function headings(text: string): Heading[] {
  const body = frontmatterBody(text)
  const offset = text.length - body.length
  const found: Heading[] = []
  let fence: { marker: string; length: number } | undefined
  for (const match of body.matchAll(/([^\r\n]*)(\r?\n|$)/g)) {
    if (match[0] === '') continue
    const line = match[1]!
    const marker = /^[ \t]*(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker) {
      if (fence === undefined) fence = { marker: marker[0]!, length: marker.length }
      else if (marker[0] === fence.marker && marker.length >= fence.length) fence = undefined
      continue
    }
    if (fence !== undefined) continue
    const heading = /^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(line)
    if (heading) found.push({
      level: heading[1]!.length, title: heading[2]!.trim().toLowerCase(),
      start: offset + match.index, end: offset + match.index + line.length,
    })
  }
  return found
}

/** Add one line to Notes without changing any existing body text. */
export function appendNote(text: string, line: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const all = headings(text)
  const noteIndex = all.findIndex((heading) => heading.level === 2 && heading.title === 'notes')
  const heading = all[noteIndex]
  if (!heading) {
    const gap = text.endsWith(eol + eol) ? '' : text.endsWith(eol) ? eol : eol + eol
    return `${text}${gap}## Notes${eol}${eol}${line}${eol}`
  }

  const start = heading.end
  const next = all.slice(noteIndex + 1).find((entry) => entry.level <= 2)
  const end = next?.start ?? text.length
  const content = text.slice(start, end)
  if (content === '') return `${text.slice(0, start)}${eol}${eol}${line}${eol}${text.slice(end)}`
  const trailing = /(?:\r?\n[ \t]*)*$/.exec(content)?.[0] ?? ''
  const prose = content.slice(0, content.length - trailing.length)
  const insertion = prose === ''
    ? `${content}${line}${eol}${next ? eol : ''}`
    : `${prose}${eol}${line}${trailing || eol}`
  return text.slice(0, start) + insertion + text.slice(end)
}
