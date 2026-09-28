/** Wrap bare angle placeholders in Markdown prose without changing protected constructs. */
export function wrapAnglePlaceholders(markdown: string): string {
  let result = ''
  let index = 0

  while (index < markdown.length) {
    const fence = fenceAt(markdown, index)
    if (fence !== undefined) {
      result += markdown.slice(index, fence.end)
      index = fence.end
      continue
    }

    if (markdown.startsWith('<!--', index)) {
      const end = markdown.indexOf('-->', index + 4)
      const limit = end === -1 ? markdown.length : end + 3
      result += markdown.slice(index, limit)
      index = limit
      continue
    }

    if (markdown.startsWith('<![CDATA[', index)) {
      const end = markdown.indexOf(']]>', index + 9)
      const limit = end === -1 ? markdown.length : end + 3
      result += markdown.slice(index, limit)
      index = limit
      continue
    }

    const htmlElement = htmlElementAt(markdown, index)
    if (htmlElement !== undefined) {
      result += markdown.slice(index, htmlElement)
      index = htmlElement
      continue
    }

    if (markdown[index] === '`') {
      const runLength = backtickRunLength(markdown, index)
      if (isEscaped(markdown, index)) {
        result += markdown.slice(index, index + runLength)
        index += runLength
        continue
      }
      const close = findClosingBacktickRun(markdown, index + runLength, runLength)
      if (close !== undefined) {
        result += markdown.slice(index, close + runLength)
        index = close + runLength
      } else {
        result += markdown.slice(index, index + runLength)
        index += runLength
      }
      continue
    }

    if (markdown[index] === '<') {
      const close = markdown.indexOf('>', index + 1)
      if (close !== -1) {
        const token = markdown.slice(index, close + 1)
        result += isBarePlaceholder(markdown, index, token) ? `\`${token}\`` : token
        index = close + 1
        continue
      }
    }

    result += markdown[index]
    index += 1
  }

  return result
}

function fenceAt(markdown: string, index: number): { end: number } | undefined {
  if (index !== 0 && markdown[index - 1] !== '\n') return undefined
  const lineEnd = markdown.indexOf('\n', index)
  const lineLimit = lineEnd === -1 ? markdown.length : lineEnd
  const line = markdown.slice(index, lineLimit).replace(/\r$/, '')
  const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
  if (opening === undefined) return undefined

  const marker = opening[0]
  const length = opening.length
  let cursor = lineEnd === -1 ? markdown.length : lineEnd + 1
  while (cursor < markdown.length) {
    const closeLineEnd = markdown.indexOf('\n', cursor)
    const closeLimit = closeLineEnd === -1 ? markdown.length : closeLineEnd
    const closeLine = markdown.slice(cursor, closeLimit).replace(/\r$/, '')
    const closing = new RegExp(`^ {0,3}${marker}{${length},}[ \\t]*$`).test(closeLine)
    if (closing) return { end: closeLineEnd === -1 ? markdown.length : closeLineEnd + 1 }
    cursor = closeLineEnd === -1 ? markdown.length : closeLineEnd + 1
  }
  return { end: markdown.length }
}

function htmlElementAt(markdown: string, index: number): number | undefined {
  if (markdown[index] !== '<' || markdown[index + 1] === '/' || markdown[index + 1] === '!' || markdown[index + 1] === '?') {
    return undefined
  }

  const opening = readHtmlTag(markdown, index)
  if (opening === undefined || opening.closing) return undefined
  const name = opening.name.toLowerCase()
  const isKnownTag = HTML_TAGS.has(name)
  const hasAttributes = /\s/.test(opening.source.slice(1 + opening.name.length, -1))
  const rawTextTag = RAW_TEXT_TAGS.has(name)
  const closing = findHtmlElementClose(markdown, opening.end, name)

  if (closing !== undefined && (isKnownTag || hasAttributes || !opening.selfClosing)) return closing
  if (rawTextTag && closing === undefined) return markdown.length
  if (isKnownTag || hasAttributes || opening.selfClosing) return opening.end
  return undefined
}

interface HtmlTag {
  name: string
  end: number
  closing: boolean
  selfClosing: boolean
  source: string
}

function readHtmlTag(markdown: string, index: number): HtmlTag | undefined {
  const prefix = /^<(\/)?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>])/.exec(markdown.slice(index))
  if (prefix === null) return undefined

  const closing = prefix[1] === '/'
  const name = prefix[2]
  if (name === undefined) return undefined
  let quote: '"' | "'" | undefined
  for (let cursor = index + prefix[0].length; cursor < markdown.length; cursor += 1) {
    const char = markdown[cursor]
    if (quote !== undefined) {
      if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') {
      const end = cursor + 1
      const source = markdown.slice(index, end)
      return { name, end, closing, selfClosing: /\/\s*>$/.test(source), source }
    }
  }
  return undefined
}

function findHtmlElementClose(markdown: string, from: number, name: string): number | undefined {
  if (VOID_TAGS.has(name)) return undefined
  let depth = 1
  let cursor = from

  while (cursor < markdown.length) {
    const tagStart = markdown.indexOf('<', cursor)
    if (tagStart === -1) return undefined
    if (markdown.startsWith('<!--', tagStart)) {
      const commentEnd = markdown.indexOf('-->', tagStart + 4)
      cursor = commentEnd === -1 ? markdown.length : commentEnd + 3
      continue
    }
    const tag = readHtmlTag(markdown, tagStart)
    if (tag === undefined) {
      cursor = tagStart + 1
      continue
    }
    if (tag.name.toLowerCase() === name) {
      if (tag.closing) {
        depth -= 1
        if (depth === 0) return tag.end
      } else if (!tag.selfClosing) {
        depth += 1
      }
    }
    cursor = tag.end
  }
  return undefined
}

function isBarePlaceholder(markdown: string, index: number, token: string): boolean {
  const value = token.slice(1, -1)
  if (!/^[A-Za-z][A-Za-z0-9_./:-]*$/.test(value)) return false
  if (isEscaped(markdown, index)) return false
  if (isLinkDestination(markdown, index)) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false
  if (/^[^<>\s@]+@[^<>\s@]+$/.test(value)) return false
  if (HTML_TAGS.has(value.toLowerCase())) return false
  return true
}

function isLinkDestination(markdown: string, index: number): boolean {
  const lineStart = markdown.lastIndexOf('\n', index - 1) + 1
  const before = markdown.slice(lineStart, index)
  if (/^ {0,3}\[[^\]\r\n]+\]:[ \t]*$/.test(before)) return true
  return /\]\([ \t]*$/.test(before)
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) slashes += 1
  return slashes % 2 === 1
}

function backtickRunLength(text: string, index: number): number {
  let end = index + 1
  while (text[end] === '`') end += 1
  return end - index
}

function findClosingBacktickRun(text: string, from: number, length: number): number | undefined {
  let cursor = from
  while (cursor < text.length) {
    if (cursor === 0 || text[cursor - 1] === '\n') {
      const fence = fenceAt(text, cursor)
      if (fence !== undefined) {
        cursor = fence.end
        continue
      }
    }
    if (text[cursor] !== '`') {
      cursor += 1
      continue
    }
    const runLength = backtickRunLength(text, cursor)
    if (runLength === length) return cursor
    cursor += runLength
  }
  return undefined
}

const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title'])

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
])

const HTML_TAGS = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo', 'blockquote',
  'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist',
  'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i',
  'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'meta',
  'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture',
  'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'section', 'select', 'small',
  'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template',
  'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
])
