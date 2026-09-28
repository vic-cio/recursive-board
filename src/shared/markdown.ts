/**
 * Wrap placeholder-like angle text in Markdown prose. Keep this pure and Node-free because the
 * template renderer is shared by the CLI and the Obsidian plugin.
 */
export function wrapAnglePlaceholders(markdown: string): string {
  const lines = markdown.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const output: string[] = []
  let fence: { marker: '`' | '~'; length: number } | undefined
  let codeSpanLength: number | undefined

  for (const line of lines) {
    const eol = line.endsWith('\n') ? (line.endsWith('\r\n') ? '\r\n' : '\n') : ''
    const content = line.slice(0, line.length - eol.length)
    const fenceMarker = codeSpanLength === undefined
      ? /^ {0,3}(`{3,}|~{3,})/.exec(content)?.[1]
      : undefined

    if (fence) {
      output.push(line)
      if (fenceMarker?.[0] === fence.marker && fenceMarker.length >= fence.length &&
          new RegExp(`^ {0,3}${fence.marker}{${fence.length},}[ \\t]*$`).test(content)) {
        fence = undefined
      }
      continue
    }

    if (fenceMarker) {
      output.push(line)
      fence = { marker: fenceMarker.startsWith('`') ? '`' : '~', length: fenceMarker.length }
      continue
    }

    const wrapped = wrapLine(content, codeSpanLength)
    output.push(wrapped.text + eol)
    codeSpanLength = wrapped.codeSpanLength
  }

  return output.join('')
}

function wrapLine(line: string, initialCodeSpanLength: number | undefined): {
  text: string
  codeSpanLength: number | undefined
} {
  let result = ''
  let index = 0
  let codeSpanLength = initialCodeSpanLength

  while (index < line.length) {
    if (codeSpanLength !== undefined) {
      const close = findBacktickRun(line, index, codeSpanLength)
      if (close === undefined) {
        result += line.slice(index)
        break
      }
      result += line.slice(index, close + codeSpanLength)
      index = close + codeSpanLength
      codeSpanLength = undefined
      continue
    }

    if (line[index] === '`') {
      let end = index + 1
      while (line[end] === '`') end += 1
      const length = end - index
      const close = findBacktickRun(line, end, length)
      if (close === undefined) {
        result += line.slice(index)
        codeSpanLength = length
        break
      }
      result += line.slice(index, close + length)
      index = close + length
      continue
    }

    if (line[index] !== '<') {
      result += line[index]
      index += 1
      continue
    }

    const close = line.indexOf('>', index + 1)
    if (close === -1) {
      result += line.slice(index)
      break
    }
    const token = line.slice(index, close + 1)
    const before = line.slice(0, index)
    result += isBarePlaceholder(token, before) ? `\`${token}\`` : token
    index = close + 1
  }

  return { text: result, codeSpanLength }
}

function isBarePlaceholder(token: string, before: string): boolean {
  const value = token.slice(1, -1)
  if (!/^[A-Za-z][A-Za-z0-9_./:-]*$/.test(value)) return false
  if (before.endsWith('](')) return false
  if (before.endsWith('\\')) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false
  if (/^[^<>\s@]+@[^<>\s@]+$/.test(value)) return false
  if (/^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>$/.test(token) &&
      (/[\s/]/.test(value) || HTML_TAGS.has(value.toLowerCase()))) return false
  return true
}

const HTML_TAGS = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo', 'blockquote',
  'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist',
  'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i',
  'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'meta',
  'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture',
  'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'section', 'select', 'small',
  'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template',
  'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video',
])

function findBacktickRun(text: string, from: number, length: number): number | undefined {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] !== '`') continue
    let end = index + 1
    while (text[end] === '`') end += 1
    if (end - index === length) return index
    index = end - 1
  }
  return undefined
}
