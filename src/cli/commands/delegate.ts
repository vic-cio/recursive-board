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
import { editItem } from '../write.ts'
import { roleTagFor } from '../../shared/role-tags.ts'
import { freeTagEditsIn } from '../../shared/tags.ts'
import type { Edit } from '../../shared/edits.ts'
import { ANY_AGENT } from '../../shared/holder.ts'
import { assignEdits, delegateTarget } from '../../shared/delegate.ts'

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
  const target = delegateTarget(options.to, await readPeople(vault.root))
  const roleTag = options.role === undefined ? undefined : roleTagFor(options.role)
  if (item.area) throw new Error(`${item.relPath} is an area, and an area cannot be assigned.`)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be assigned.`)
  const holder = target.kind === 'any' ? ANY_AGENT : target.name
  // The holder and the role tag go in one write.
  await editItem(item, (text): Edit[] | null => {
    const edits = [...(assignEdits(text, holder) ?? []), ...(roleTag ? freeTagEditsIn(text, roleTag, true) ?? [] : [])]
    return edits.length > 0 ? edits : null
  })
  return { item, holder }
}
