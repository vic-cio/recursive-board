/**
 * Line-wise YAML frontmatter editing.
 *
 * The vault is the canonical layer, so this module never reserialises a frontmatter block. It
 * rewrites the one line it was asked to change and copies every other byte. That is what keeps
 * `AGENTS.md` integrity rule 5 ("change the one key you mean to change") and the rule that an
 * unknown key is preserved untouched.
 *
 * It understands scalars, which is every field in the v1 schema. A block entry such as a `tags:`
 * list parses as a keyed entry with no scalar value, so it is preserved and can be replaced or
 * removed as a unit, but it is not read as a list.
 */

export type Scalar = string | number | boolean

export interface Entry {
  key: string
  /** Index of the entry's first line within the frontmatter lines. */
  start: number
  /** Index one past the entry's last line. */
  end: number
  /** The parsed value of a single-line `key: value` entry. A block entry has none. */
  value: Scalar | undefined
}

export interface Frontmatter {
  entries: Entry[]
  keys(): string[]
  has(key: string): boolean
  get(key: string): Scalar | undefined
  entry(key: string): Entry | undefined
}

/** A key line: no leading space, a key, a colon, then an optional value. */
const KEY_LINE = /^([A-Za-z_][\w.-]*)\s*:(?:[ \t]+(.*))?$/

interface Block {
  /** Frontmatter lines, without their terminators. */
  lines: string[]
  /** The line terminator each line carried, parallel to `lines`. */
  ends: string[]
  /** Offset in the source text where the first frontmatter line begins. */
  contentStart: number
  /** Offset in the source text where the closing fence line begins. */
  contentEnd: number
}

function splitBlock(text: string): Block | null {
  if (!text.startsWith('---')) return null
  const first = /^---[ \t]*\r?\n/.exec(text)
  if (!first) return null

  const lines: string[] = []
  const ends: string[] = []
  const contentStart = first[0].length
  let cursor = contentStart

  while (cursor < text.length) {
    const nl = text.indexOf('\n', cursor)
    const hasNewline = nl !== -1
    const lineEnd = hasNewline ? nl + 1 : text.length
    const raw = text.slice(cursor, lineEnd)
    const line = raw.replace(/\r?\n$/, '')
    const end = raw.slice(line.length)

    if (/^---[ \t]*$/.test(line)) {
      return { lines, ends, contentStart, contentEnd: cursor }
    }
    lines.push(line)
    ends.push(end)
    cursor = lineEnd
    if (!hasNewline) break
  }
  // The block never closed, so this file has no frontmatter.
  return null
}

function readEntries(lines: string[]): Entry[] {
  const entries: Entry[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = KEY_LINE.exec(lines[i]!)
    if (!match) continue
    const [, key, rest] = match
    const value = rest === undefined || rest.trim() === '' ? undefined : parseScalar(rest)
    // A block entry owns every following line that is indented or blank.
    let end = i + 1
    if (value === undefined) {
      while (end < lines.length && (/^[ \t]/.test(lines[end]!) || lines[end]!.trim() === '')) end++
    }
    entries.push({ key: key!, start: i, end, value })
    i = end - 1
  }
  return entries
}

/** Reads a single-line YAML scalar. Returns undefined for a value this module will not interpret. */
export function parseScalar(raw: string): Scalar | undefined {
  const text = raw.trim()
  if (text === '') return undefined
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return text.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, "'")
  }
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^-?\d+$/.test(text)) return Number(text)
  if (/^-?\d*\.\d+$/.test(text)) return Number(text)
  // A flow collection is a block entry as far as this module is concerned.
  if (text.startsWith('[') || text.startsWith('{')) return undefined
  return text
}

/** True when the plain form of this string would read back as something other than that string. */
function needsQuotes(text: string): boolean {
  if (text === '') return true
  if (text !== text.trim()) return true
  if (/^[[\]{}#&*!|>'"%@`,?-]/.test(text)) return true
  if (text.includes(': ') || text.includes(' #') || /[\r\n]/.test(text)) return true
  if (text.endsWith(':')) return true
  if (/["'\\]/.test(text)) return true
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(text)) return true
  if (/^-?\d+(\.\d+)?$/.test(text)) return true
  return false
}

/** Renders a scalar for a frontmatter line, quoting only when YAML would otherwise misread it. */
export function formatScalar(value: Scalar): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (!needsQuotes(value)) return value
  return `"${value.replace(/([\\"])/g, '\\$1')}"`
}

/** Reads the frontmatter of a Markdown file. Returns null when the file has none. */
export function parseFrontmatter(text: string): Frontmatter | null {
  const block = splitBlock(text)
  if (!block) return null
  const entries = readEntries(block.lines)
  const byKey = new Map(entries.map((e) => [e.key, e]))
  return {
    entries,
    keys: () => entries.map((e) => e.key),
    has: (key) => byKey.has(key),
    get: (key) => byKey.get(key)?.value,
    entry: (key) => byKey.get(key),
  }
}

/** The body of a Markdown file, with its frontmatter removed. */
export function frontmatterBody(text: string): string {
  const block = splitBlock(text)
  if (!block) return text
  const fenceEnd = text.indexOf('\n', block.contentEnd)
  return fenceEnd === -1 ? '' : text.slice(fenceEnd + 1)
}

function rewrite(text: string, block: Block, lines: string[], ends: string[]): string {
  const head = text.slice(0, block.contentStart)
  const tail = text.slice(block.contentEnd)
  const middle = lines.map((line, i) => line + (ends[i] ?? '\n')).join('')
  return head + middle + tail
}

/**
 * Sets one frontmatter key, appending it before the closing fence when it is absent.
 * Every other line, including a key this module does not recognise, is copied verbatim.
 */
export function setKey(text: string, key: string, value: Scalar): string {
  const block = splitBlock(text)
  if (!block) throw new Error(`cannot set "${key}": the file has no frontmatter`)

  const entry = readEntries(block.lines).find((e) => e.key === key)
  const line = `${key}: ${formatScalar(value)}`
  const lines = [...block.lines]
  const ends = [...block.ends]

  if (entry) {
    lines.splice(entry.start, entry.end - entry.start, line)
    ends.splice(entry.start, entry.end - entry.start, ends[entry.start] ?? '\n')
  } else {
    lines.push(line)
    ends.push(ends[ends.length - 1] ?? defaultEnd(text))
  }
  return rewrite(text, block, lines, ends)
}

/** Removes one frontmatter key, and every continuation line of a block entry. */
export function removeKey(text: string, key: string): string {
  const block = splitBlock(text)
  if (!block) return text

  const entry = readEntries(block.lines).find((e) => e.key === key)
  if (!entry) return text

  const lines = [...block.lines]
  const ends = [...block.ends]
  lines.splice(entry.start, entry.end - entry.start)
  ends.splice(entry.start, entry.end - entry.start)
  return rewrite(text, block, lines, ends)
}

function defaultEnd(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n'
}
