/**
 * `wi validate` — the schema and layout checker described in docs/adr/0004-wi-is-the-programmatic-write-interface.md.
 *
 * It runs from a Git pre-commit hook on the vault repo, which is the moment damage becomes
 * permanent and the diff is still visible. It catches what the plugin cannot: a hand edit on the
 * phone, an agent rewriting YAML, a sync layer resurrecting a stale copy.
 *
 * Two rules govern what it does about a problem. It reports; it never repairs (integrity rule 4).
 * And an unknown frontmatter key is a warning at most, because rule 27.6 says to preserve it.
 */
import {
  CORE_FIELDS, OPTIONAL_FIELDS, STATUSES, isStatus, parseWikilink,
} from '../../shared/schema.ts'
import type { Vault, WorkItem } from '../vault.ts'

export type Severity = 'error' | 'warning'

export interface Problem {
  rule: string
  severity: Severity
  relPath: string
  id: string | undefined
  message: string
}

export interface Report {
  problems: Problem[]
  errorCount: number
  warningCount: number
  /** True when no error was found. A warning never fails a vault. */
  ok: boolean
  itemCount: number
}

const ID_SHAPE = /^wi-[a-z0-9]+$/
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/
const KNOWN_FIELDS = new Set<string>([...CORE_FIELDS, ...OPTIONAL_FIELDS])
const DATE_FIELDS = ['created', 'updated'] as const

export async function validate(vault: Vault): Promise<Report> {
  const problems: Problem[] = []

  const report = (
    rule: string, severity: Severity, relPath: string, id: string | undefined, message: string,
  ) => problems.push({ rule, severity, relPath, id, message })

  checkLayout(vault, report)
  checkIdentity(vault, report)

  for (const item of vault.items) {
    checkItem(item, vault, report)
  }

  checkDefaultRoot(vault, report)
  checkRoots(vault, report)
  checkCycles(vault, report)

  problems.sort((a, b) => a.relPath.localeCompare(b.relPath) || a.rule.localeCompare(b.rule))

  const errorCount = problems.filter((p) => p.severity === 'error').length
  return {
    problems,
    errorCount,
    warningCount: problems.length - errorCount,
    ok: errorCount === 0,
    itemCount: vault.items.length,
  }
}

type Reporter = (
  rule: string, severity: Severity, relPath: string, id: string | undefined, message: string,
) => void

function checkDefaultRoot(vault: Vault, report: Reporter): void {
  const configured = vault.config.defaultRoot
  if (configured === null) return

  const target = vault.items.find((item) => item.stem.toLowerCase() === configured.toLowerCase())
  if (target !== undefined && target.parent === null) return

  report('default-root-unresolved', 'warning', '.wi.json', target?.id,
    `sets defaultRoot to "${configured}", which does not name a root work item.`)
}

/** docs/adr/0003-flat-configurable-work-item-folder.md keeps work items flat. Templates/
 * is also checked for nesting; other vault folders are outside the validator's scope. */
function checkLayout(vault: Vault, report: Reporter): void {
  for (const relPath of vault.misplaced) {
    report('folder-nested', 'error', relPath, undefined,
      'sits below one of the product folders. Hierarchy lives in the parent wikilink, never in a folder.')
  }
  for (const relPath of vault.nonItems) {
    report('not-a-work-item', 'warning', relPath, undefined,
      `sits in ${vault.config.workItemFolder}/ but has no \`type: work-item\`. The board will never show it.`)
  }
  for (const relPath of vault.unaccounted) {
    report('unaccounted-file', 'warning', relPath, undefined,
      'is a hidden file that is not Markdown, so its contents were not read. Let the sync client download it if it is a work item, or delete it if it is a stray file, then validate again.')
  }
}

function checkIdentity(vault: Vault, report: Reporter): void {
  const byId = new Map<string, WorkItem[]>()
  for (const item of vault.items) {
    if (item.id === undefined) continue
    byId.set(item.id, [...(byId.get(item.id) ?? []), item])
  }
  for (const [id, items] of byId) {
    if (items.length < 2) continue
    const files = items.map((i) => i.relPath).join(', ')
    for (const item of items) {
      report('id-duplicate', 'error', item.relPath, id,
        `shares id ${id} with another work item. Both files: ${files}. The id is what recovers the hierarchy, so it must be unique.`)
    }
  }
}

function checkItem(item: WorkItem, vault: Vault, report: Reporter): void {
  const say = (rule: string, severity: Severity, message: string) =>
    report(rule, severity, item.relPath, item.id, message)

  const rawId = item.frontmatter.get('id')
  if (rawId === undefined || rawId === '') say('id-missing', 'error', 'has no id.')
  else if (!ID_SHAPE.test(String(rawId))) {
    say('id-malformed', 'error', `has id "${rawId}". An id looks like wi-a7f3.`)
  }

  if (item.title === undefined) say('title-missing', 'error', 'has no title.')

  const rawStatus = item.frontmatter.get('status')
  const isRoot = !item.frontmatter.has('parent')

  if (isRoot) {
    if (rawStatus !== undefined) {
      say('status-on-root', 'error',
        `is a root and carries status "${rawStatus}". A root is not a card in anyone's column, so it takes no status.`)
    }
  } else if (rawStatus === undefined) {
    say('status-missing', 'error', `has no status. Use one of: ${STATUSES.join(', ')}.`)
  } else if (!isStatus(rawStatus)) {
    say('status-invalid', 'error',
      `has status "${rawStatus}". The four values are ${STATUSES.join(', ')}.`)
  }

  if (!isRoot) {
    const raw = item.frontmatter.get('parent')
    if (parseWikilink(raw) === null) {
      say('parent-malformed', 'error',
        `has parent ${JSON.stringify(raw)}, which is not a wikilink. Write parent: "[[Title]]".`)
    } else if (vault.resolveLink(item.parent) === undefined) {
      say('parent-unresolved', 'error',
        `points at [[${item.parent}]], which no file matches. This item appears on no board. Fix the link or recreate the parent; do not delete the child.`)
    }
  }

  const board = item.frontmatter.get('board')
  if (board === false) {
    say('board-false', 'error',
      'carries board: false. Demotion deletes the key; absence means not a board.')
  } else if (board !== undefined && board !== true) {
    say('board-invalid', 'error', `carries board: ${board}. The only value is true.`)
  }

  const archived = item.frontmatter.get('archived')
  if (archived === false) {
    say('archived-false', 'error',
      'carries archived: false. Unarchiving deletes the key; absence means visible.')
  } else if (archived !== undefined && archived !== true) {
    say('archived-invalid', 'error', `carries archived: ${archived}. The only value is true.`)
  }

  const prev = item.frontmatter.get('prev_status')
  if (prev !== undefined) {
    if (!isStatus(prev)) {
      say('prev-status-invalid', 'error',
        `has prev_status "${prev}". It holds what the item was before it was ticked done.`)
    } else if (item.status !== 'done') {
      say('prev-status-stale', 'warning',
        `has prev_status while its status is "${item.status}". Leaving done should clear it.`)
    }
  }

  for (const field of DATE_FIELDS) {
    const value = item.frontmatter.get(field)
    if (value === undefined) {
      say('date-missing', 'error',
        `has no ${field}. The sibling sort and the Done window both read it.`)
    } else if (!DATE_SHAPE.test(String(value))) {
      say('date-invalid', 'error', `has ${field}: ${value}. Dates are YYYY-MM-DD.`)
    }
  }

  for (const key of item.frontmatter.keys()) {
    if (KNOWN_FIELDS.has(key)) continue
    say('unknown-key', 'warning',
      `carries "${key}", which is outside the schema. It is preserved, not stripped. Use a supported field or remove it.`)
  }
}

function checkRoots(vault: Vault, report: Reporter): void {
  const roots = vault.items.filter((i) => !i.frontmatter.has('parent'))
  if (vault.items.length === 0 && roots.length === 0) {
    report('root-missing', 'warning', vault.config.workItemFolder, undefined,
      'holds no work items yet, so the vault has no root.')
    return
  }
  if (roots.length === 0) {
    report('root-missing', 'warning', vault.config.workItemFolder, undefined,
      'holds no root. A root is a work item with no parent, and every board hangs off one.')
    return
  }
  if (roots.length > 1) {
    const files = roots.map((r) => r.relPath).join(', ')
    for (const root of roots) {
      report('root-multiple', 'warning', root.relPath, root.id,
        `is one of ${roots.length} roots: ${files}. Nothing forbids this, but a defaultRoot can name only one.`)
    }
  }
}

/** Integrity rule 3: a work item is never its own ancestor. */
function checkCycles(vault: Vault, report: Reporter): void {
  for (const item of vault.items) {
    const seen = new Set<string>([item.relPath])
    let current: WorkItem | undefined = item
    for (;;) {
      current = vault.resolveLink(current.parent)
      if (current === undefined) break
      if (seen.has(current.relPath)) {
        report('cycle', 'error', item.relPath, item.id,
          `is its own ancestor. The parent chain loops back through ${current.relPath}.`)
        break
      }
      seen.add(current.relPath)
    }
  }
}
