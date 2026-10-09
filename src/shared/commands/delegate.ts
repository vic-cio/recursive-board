/**
 * `wi delegate` — hand a card to a person, or ask any agent to take it
 * (docs/adr/0058-delegate-a-card.md, docs/adr/0063-wi-starts-no-agents.md).
 *
 * Delegating names the holder and nothing else; the status stays. For a person it writes their
 * name. For `agent` it writes the reserved holder that asks any agent. wi starts no agent: a
 * harness starts its own with its own tools, and that agent runs `wi claim` by its own name.
 * `--role` adds the role tag in the same write.
 */
import { readPeople, type Vault, type WorkItem } from '../vault.ts'
import { editItem } from '../edit-item.ts'
import { roleTagFor } from '../role-tags.ts'
import { freeTagEditsIn } from '../tags.ts'
import type { Edit } from '../edits.ts'
import { ANY_AGENT, isAnyAgent } from '../holder.ts'
import { assignEdits, delegateTarget } from '../delegate.ts'
import { UsageError, type RunFunction } from './command.ts'
import { refOf, singleLineOption } from './options.ts'
import { json, label } from './output.ts'

export interface DelegateOptions {
  /** A person (a note with type: person), or `agent` for any agent. */
  to: string
  /** A role name or tag. The card gets the tag `role/<name>` in the same write (docs/adr/0062-role-tags.md). */
  role?: string | undefined
}

export interface DelegateResult {
  item: WorkItem
  holder: string
}

export async function delegate(vault: Vault, ref: string, options: DelegateOptions): Promise<DelegateResult> {
  const item = vault.resolve(ref)
  const target = delegateTarget(options.to, await readPeople(vault.port))
  const roleTag = options.role === undefined ? undefined : roleTagFor(options.role)
  if (item.area) throw new Error(`${item.relPath} is an area, and an area cannot be assigned.`)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be assigned.`)
  const holder = target.kind === 'any' ? ANY_AGENT : target.name
  // The holder and the role tag go in one write.
  await editItem(vault, item, (text): Edit[] | null => {
    const edits = [...(assignEdits(text, holder) ?? []), ...(roleTag ? freeTagEditsIn(text, roleTag, true) ?? [] : [])]
    return edits.length > 0 ? edits : null
  })
  return { item, holder }
}

/** `wi delegate <ref> --to <person|agent> [--role <name>]`. */
export const runDelegate: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  if (ref === '') throw new UsageError('wi delegate needs a <ref> and --to <person|agent>.')
  const to = singleLineOption(line.values, 'to')
  const role = line.values['role'] === undefined ? undefined : singleLineOption(line.values, 'role')
  const result = await delegate(await context.vault(), ref, { to, role })
  if (line.values['json'] === true) context.out(json({ id: result.item.id ?? null, path: result.item.relPath, holder: result.holder }))
  else {
    const what = isAnyAgent(result.holder) ? 'any agent may take it' : `assigned to ${result.holder}`
    context.out(`${label(result.item)}  ${result.item.status}  (${what})\n`)
  }
  return 0
}
