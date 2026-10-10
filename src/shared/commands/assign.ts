/**
 * `wi assign` — add a person or any agent to a card's assignees, or remove one with `--off`
 * (docs/adr/0083-assign-and-several-holders.md, docs/adr/0063-wi-starts-no-agents.md).
 *
 * Assigning adds one name and nothing else; the status stays, and no note is written. For a person
 * it writes their name. For `agent` it writes the reserved assignee that asks any agent. wi starts no
 * agent: a harness starts its own with its own tools, and that agent runs `wi claim` by its own
 * name. `--role` adds the role tag in the same write.
 */
import { readPeople, type Vault, type WorkItem } from '../vault.ts'
import { editItem } from '../edit-item.ts'
import { roleTagFor } from '../role-tags.ts'
import { freeTagEditsIn } from '../tags.ts'
import { applyEdits, type Edit } from '../edits.ts'
import { ANY_AGENT, assigneesIn, assigneesLabel, isAnyAgent } from '../assignee.ts'
import { assignEdits, assignTarget, unassignEdits } from '../assign.ts'
import { UsageError, type RunFunction } from './command.ts'
import { refOf, singleLineOption } from './options.ts'
import { json, label } from './output.ts'

export interface AssignOptions {
  /** A person (a note with type: person), or `agent` for any agent. With `off`, any assignee's name. */
  to: string
  /** A role name or tag. The card gets the tag `role/<name>` in the same write (docs/adr/0062-role-tags.md). */
  role?: string | undefined
  /** Remove the name from the assignees instead of adding it. */
  off?: boolean | undefined
}

export interface AssignResult {
  item: WorkItem
  /** The name added or removed. */
  name: string
  /** The card's assignees after the write. */
  assignees: string[]
  added: boolean
  changed: boolean
}

export async function assign(vault: Vault, ref: string, options: AssignOptions): Promise<AssignResult> {
  const item = vault.resolve(ref)
  const added = options.off !== true
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be assigned.`)
  if (added && item.area) throw new Error(`${item.relPath} is an area, and an area cannot be assigned.`)
  // An assignee that leaves needs no person note: an agent leaves by its own name.
  const name = added ? assigneeName(assignTarget(options.to, await readPeople(vault.port))) : options.to.trim()
  if (name === '') throw new UsageError('wi assign --off needs --to <name>.')
  const roleTag = options.role === undefined ? undefined : roleTagFor(options.role)
  let assignees: string[] = []
  let changed = false
  // The assignee and the role tag go in one write.
  await editItem(vault, item, (text): Edit[] | null => {
    const assigneeEdits = added ? assignEdits(text, name) : unassignEdits(text, name)
    changed = assigneeEdits !== null
    assignees = assigneesIn(assigneeEdits === null ? text : applyEdits(text, assigneeEdits))
    const edits = [...(assigneeEdits ?? []), ...(roleTag ? freeTagEditsIn(text, roleTag, true) ?? [] : [])]
    return edits.length > 0 ? edits : null
  })
  return { item, name, assignees, added, changed }
}

function assigneeName(target: ReturnType<typeof assignTarget>): string {
  return target.kind === 'any' ? ANY_AGENT : target.name
}

/** `wi assign <ref> --to <person|agent> [--role <name>] [--off]`. */
export const runAssign: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  if (ref === '') throw new UsageError('wi assign needs a <ref> and --to <person|agent>.')
  const to = singleLineOption(line.values, 'to')
  const role = line.values['role'] === undefined ? undefined : singleLineOption(line.values, 'role')
  const result = await assign(await context.vault(), ref, { to, role, off: line.values['off'] === true })
  if (line.values['json'] === true) {
    context.out(json({ id: result.item.id ?? null, path: result.item.relPath, name: result.name, assignees: result.assignees,
      added: result.added, changed: result.changed }))
    return 0
  }
  const who = isAnyAgent(result.name) ? 'any agent' : result.name
  if (!result.changed) {
    context.out(`${label(result.item)} ${result.added ? 'already has' : 'does not have'} ${who} as an assignee. Nothing written.\n`)
  } else if (!result.added) {
    context.out(`${label(result.item)}  ${result.item.status}  (unassigned ${who}; assignees: ${assigneesLabel(result.assignees) || 'none'})\n`)
  } else {
    const what = isAnyAgent(result.name) ? 'any agent may take it' : `assigned to ${result.name}`
    const others = result.assignees.length > 1 ? `; assignees: ${assigneesLabel(result.assignees)}` : ''
    context.out(`${label(result.item)}  ${result.item.status}  (${what}${others})\n`)
  }
  return 0
}
