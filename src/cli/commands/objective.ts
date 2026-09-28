/** Print the objective chain for one card without changing the vault. */
import { parseWikilink } from '../../shared/schema.ts'
import type { Vault, WorkItem } from '../vault.ts'

const MAX_CHAIN = 12
const MAX_OBJECTIVE = 1200
const MAX_OUTPUT = 4800

interface ObjectiveRow {
  id: string | undefined
  title: string
  objective: string
}

interface ObjectiveChain {
  item: WorkItem
  rows: ObjectiveRow[]
  issue: string | null
}

/** Returns a bounded current-card-to-root report, or an empty string when no target is safe. */
export function objectiveReport(vault: Vault, ref?: string, env: NodeJS.ProcessEnv = process.env): string {
  const selected = ref === undefined ? resolveTarget(vault, env) : vault.resolve(ref)
  if (!selected) return ''
  return renderChain(buildChain(vault, selected))
}

function resolveTarget(vault: Vault, env: NodeJS.ProcessEnv): WorkItem | null {
  const card = env['WI_CARD']?.trim()
  if (card) {
    try {
      return vault.resolve(card)
    } catch {
      // A stale card reference can fall through to a single safe agent claim.
    }
  }

  const agent = env['WI_AGENT']?.trim()
  if (!agent) return null
  const candidates = vault.items.filter((item) => item.status === 'doing' && item.frontmatter.get('agent') === agent)
  const ranked = candidates.map((item) => {
    const chain = buildChain(vault, item)
    return { item, depth: chain.rows.length, issue: chain.issue }
  })
  if (ranked.length === 0 || ranked.some((candidate) => candidate.issue !== null)) return null
  const deepest = Math.max(...ranked.map((candidate) => candidate.depth))
  const winners = ranked.filter((candidate) => candidate.depth === deepest)
  return winners.length === 1 ? winners[0]!.item : null
}

function buildChain(vault: Vault, start: WorkItem): ObjectiveChain {
  const rows: ObjectiveRow[] = []
  const visited = new Set<string>()
  let current: WorkItem | undefined = start
  let issue: string | null = null

  while (current) {
    if (visited.has(current.relPath)) {
      issue = `Chain stopped: cycle at ${current.title ?? current.stem}.`
      break
    }
    if (rows.length >= MAX_CHAIN) {
      issue = `Chain stopped after ${MAX_CHAIN} cards.`
      break
    }
    visited.add(current.relPath)
    rows.push({ id: current.id, title: current.title ?? current.stem, objective: extractObjective(current.text) })

    if (current.parentRaw === undefined) break
    const parentName = parseWikilink(current.parentRaw)
    if (parentName === null) {
      issue = `Chain stopped: parent link is invalid (${current.parentRaw}).`
      break
    }
    const parent = vault.resolveLink(parentName)
    if (!parent) {
      issue = `Chain stopped: parent "${parentName}" is missing.`
      break
    }
    if (visited.has(parent.relPath)) {
      issue = `Chain stopped: cycle at ${parent.title ?? parent.stem}.`
      break
    }
    current = parent
  }

  return { item: start, rows, issue }
}

function extractObjective(text: string): string {
  const content = text.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, '')
  const lines = content.split(/\r?\n/)
  const heading = lines.findIndex((line) => /^#{1,6}\s+Objective\s*$/i.test(line.trim()))
  if (heading < 0) return '[Objective missing]'
  const body: string[] = []
  for (const line of lines.slice(heading + 1)) {
    if (/^#{1,6}\s+/.test(line.trim())) break
    body.push(line)
  }
  const value = body.join('\n').trim()
  if (!value) return '[Objective missing]'
  if (value.length <= MAX_OBJECTIVE) return value
  return `${value.slice(0, MAX_OBJECTIVE - 15).trimEnd()} [truncated]`
}

function renderChain(chain: ObjectiveChain): string {
  const lines = ['Objective chain (current card to root):']
  chain.rows.forEach((row, index) => {
    const id = row.id ? ` (${row.id})` : ''
    lines.push(`${index + 1}. ${row.title}${id}`)
    lines.push(`   ${row.objective}`)
  })
  if (chain.issue) lines.push(chain.issue)
  let output = `${lines.join('\n')}\n`
  const marker = '\n[output truncated]\n'
  if (output.length > MAX_OUTPUT) output = `${output.slice(0, MAX_OUTPUT - marker.length).trimEnd()}${marker}`
  return output
}
