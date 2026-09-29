/** Read-only candidate discovery. It never decides which consumer claim is wrong. */
import { readdir, readFile, realpath, stat, lstat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Vault } from '../vault.ts'

interface Reference { path: string; line: number }
interface TextMatch extends Reference { text: string }
interface Document { path: string; text: string }
export interface TraceReport {
  source: { path: string; heading: string }
  claim: string
  linkedConsumers: Reference[]
  noteLinks: Reference[]
  unlinkedMatches: TextMatch[]
  scope: { folders: string[]; filesRead: number }
  gaps: string[]
  record: { affectedFiles: string[]; correctionEvidence: string; unresolvedCopies: string[]; searchGaps: string[] }
}
interface TraceOptions { vault: Pick<Vault, 'root' | 'config'>; source: string; heading: string; claim: string }

const BASE_GAPS = [
  'Text search can miss paraphrases and older copies.',
  'Files outside the scanned folders, including external skills and memory, were not searched.',
]
const portable = (path: string) => path.split(sep).join('/')
const noteKey = (path: string) => path.replace(/\.md$/i, '').toLowerCase()
function decoded(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}
function headingKey(value: string): string {
  return decoded(value).trim().replace(/\s+#+$/, '').toLowerCase().replace(/\s+/g, '-')
}
function inside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/** Input paths and source passage are validated here, at the filesystem boundary. */
export async function correctionTrace({ vault, source, heading, claim }: TraceOptions): Promise<TraceReport> {
  if (!heading.trim() || !claim.trim()) throw new Error('wi trace needs a non-empty --heading and --claim.')
  const root = await realpath(vault.root)
  const requested = resolve(root, source)
  if (!inside(root, requested)) throw new Error('The source must be inside the vault.')
  let canonical: string
  try { canonical = await realpath(requested) } catch { throw new Error(`Source file ${source} was not found.`) }
  if (!inside(root, canonical)) throw new Error('The source must be inside the vault.')
  if (!/\.md$/i.test(canonical) || !(await stat(canonical)).isFile()) throw new Error('The source must be a Markdown file.')
  const sourcePath = portable(relative(root, canonical))
  const sourceText = await readFile(canonical, 'utf8')
  let fence: { marker: string; length: number } | null = null
  const exists = sourceText.split(/\r?\n/).some(line => {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    const marker = delimiter?.[1]
    if (marker) {
      if (fence === null) fence = { marker: marker[0] ?? '', length: marker.length }
      else if (marker[0] === fence.marker && marker.length >= fence.length && !delimiter?.[2]?.trim()) fence = null
      return false
    }
    if (fence !== null) return false
    const found = /^ {0,3}#{1,6}\s+(.+?)\s*$/.exec(line)
    return found?.[1] !== undefined && headingKey(found[1]) === headingKey(heading)
  })
  if (!exists) throw new Error(`Source heading "${heading}" was not found in ${sourcePath}.`)
  const folders = [...new Set(['Knowledge', vault.config.workItemFolder])]
  const gaps = [...BASE_GAPS]
  const documents: Document[] = []
  async function scan(folder: string): Promise<void> {
    let entries
    try {
      const path = join(root, folder)
      if ((await lstat(path)).isSymbolicLink() || !inside(root, await realpath(path))) {
        gaps.push(`Skipped symbolic link ${folder}.`)
        return
      }
      entries = await readdir(path, { withFileTypes: true })
    } catch {
      gaps.push(`Could not read folder ${folder}.`)
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${folder}/${entry.name}`
      if (entry.isSymbolicLink()) { gaps.push(`Skipped symbolic link ${path}.`); continue }
      if (entry.isDirectory()) { await scan(path); continue }
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
      try {
        const canonical = await realpath(join(root, path))
        if (!inside(root, canonical)) { gaps.push(`Skipped external file ${path}.`); continue }
        documents.push({ path, text: await readFile(canonical, 'utf8') })
      }
      catch { gaps.push(`Could not read file ${path}.`) }
    }
  }
  for (const folder of folders) await scan(folder)
  // An explicitly selected source outside the search folders still provides passage authority.
  const known = documents.some(d => d.path === sourcePath) ? documents : [...documents, { path: sourcePath, text: sourceText }]
  return findConsumers({ source: { path: sourcePath, heading: heading.trim() }, claim: claim.trim(), documents, known, folders, gaps })
}

interface FindOptions {
  source: TraceReport['source']; claim: string; documents: Document[]; known: Document[]; folders: string[]; gaps: string[]
}
function findConsumers({ source, claim, documents, known, folders, gaps }: FindOptions): TraceReport {
  const linkedConsumers: Reference[] = [], noteLinks: Reference[] = [], unlinkedMatches: TextMatch[] = []
  const sourceKey = noteKey(source.path), targetHeading = headingKey(source.heading)
  function wikiTarget(target: string, document: Document): string | null {
    const key = noteKey(decoded(target).replace(/^\//, ''))
    if (!key) return noteKey(document.path)
    if (key.startsWith('./') || key.startsWith('../')) return noteKey(portable(relative('.', resolve(dirname(document.path), key))))
    const exact = known.find(d => noteKey(d.path) === key)
    if (exact) return noteKey(exact.path)
    const matches = known.filter(d => key.includes('/') ? noteKey(d.path).endsWith(`/${key}`) : noteKey(basename(d.path)) === key)
    if (matches.length > 1) { gaps.push(`Source-name link ${target} is ambiguous in ${document.path}.`); return null }
    return matches[0] ? noteKey(matches[0].path) : null
  }
  for (const document of documents.sort((a, b) => a.path.localeCompare(b.path))) {
    if (document.path === source.path) continue
    const headingLines = new Set<number>(), noteLines = new Set<number>(), textRows: TextMatch[] = []
    document.text.split(/\r?\n/).forEach((text, index) => {
      const line = index + 1
      if (text.toLowerCase().includes(claim.toLowerCase())) textRows.push({ path: document.path, line, text: text.trim() })
      function add(target: string, markdown: boolean) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return
        const [rawFile = '', rawHeading] = target.split('#', 2)
        const resolved = markdown
          ? noteKey(portable(relative('.', resolve(dirname(document.path), decoded(rawFile)))))
          : wikiTarget(rawFile, document)
        if (resolved !== sourceKey) return
        if (rawHeading === undefined || rawHeading === '') noteLines.add(line)
        else if (headingKey(rawHeading) === targetHeading) headingLines.add(line)
      }
      for (const match of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) if (match[1]) add(match[1].split('|', 1)[0] ?? '', false)
      for (const match of text.matchAll(/\[[^\]\n]*\]\((?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^\n]*["'])?\)/g)) {
        const target = match[1] ?? match[2]
        if (target) add(target, true)
      }
    })
    for (const line of headingLines) linkedConsumers.push({ path: document.path, line })
    for (const line of noteLines) noteLinks.push({ path: document.path, line })
    if (headingLines.size === 0) unlinkedMatches.push(...textRows)
  }
  return {
    source, claim, linkedConsumers, noteLinks, unlinkedMatches,
    scope: { folders, filesRead: documents.length }, gaps: [...new Set(gaps)],
    record: { affectedFiles: [], correctionEvidence: '', unresolvedCopies: [], searchGaps: [] },
  }
}

export function renderCorrectionTrace(report: TraceReport): string {
  const references = (rows: Reference[]) => rows.length ? rows.map(r => `- ${JSON.stringify(r.path)}:${r.line}`).join('\n') : '- None found.'
  return [
    'Knowledge correction trace', '',
    `Source: ${JSON.stringify(report.source.path)}#${report.source.heading}`, `Claim: ${report.claim}`, '',
    '## Linked consumers', references(report.linkedConsumers), '',
    '## Note-only links', references(report.noteLinks), 'A note-only link does not establish a copied claim.', '',
    '## Unlinked text candidates', references(report.unlinkedMatches), 'Check each candidate before marking it affected.', '',
    '## Search scope', `Folders: ${report.scope.folders.join(', ')}. Files read: ${report.scope.filesRead}.`, '',
    '## Search gaps', ...report.gaps.map(g => `- ${g}`), '',
    '## Affected files', '- Record the verified affected files here.', '',
    '## Correction evidence', '- Record the corrected claim and its evidence here.', '',
    '## Unresolved copies', '- Record the remaining copies here.', '',
    '## Recorded search gaps', '- Record the additional search gaps here.', '',
  ].join('\n')
}
