import { openDependencies, titleOf } from '../dependencies.ts'
import { waitingRefusal } from '../../shared/dependencies.ts'
import { editItem } from '../write.ts'
import { claimEdits, releaseEdits } from '../../shared/transitions.ts'
import { appendNote } from '../../shared/notes.ts'
import { cardState } from '../../shared/card-state.ts'
import { today, type Status } from '../../shared/schema.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface ClaimChange {
  item: WorkItem
  agent: string
  from: Status | undefined
  to: 'doing'
  changed: boolean
}

export interface ReleaseChange {
  item: WorkItem
  agent: string
  from: Status | undefined
  to: 'options'
  reason: string
  where: string | undefined
  changed: true
}

/**
 * The claim is decided under the lock, from the card as it is then
 * (docs/adr/0054-edits-from-the-file-at-write-time.md): of two agents that claim one card at once,
 * the second finds the first one's name and is refused. Other cards, such as the dependencies and
 * the children, come from the loaded vault. `editBody` adds to the same write, as `wi delegate`
 * adds its note.
 */
export async function claimItem(
  vault: Vault,
  ref: string,
  agent: string,
  editBody?: (text: string) => string,
): Promise<ClaimChange> {
  const item = vault.resolve(ref)
  if (item.area) throw new Error(`${item.relPath} is an area, and an area cannot be claimed.`)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be claimed.`)
  const otherDoingChild = vault.childrenOf(item).some((child) =>
    child.status === 'doing' && child.frontmatter.get('agent') !== agent)
  let from = item.status
  let changed = false
  await editItem(item, (text) => {
    const state = cardState(text)
    from = state.status
    const holding = state.agent === agent && state.status === 'doing'
    if (!holding && state.blocked) {
      throw new Error(`${item.relPath} is blocked. Clear its blocked flag when the block is gone, or claim another card.`)
    }
    const waiting = holding ? [] : openDependencies(vault, item, text)
    if (waiting.length > 0) throw new Error(waitingRefusal(item.relPath, waiting.map(titleOf)))
    const edits = claimEdits(state.status, state.agent, agent, state.hasPrevStatus, state.board && otherDoingChild)
    changed = edits !== null
    return edits
  }, editBody)
  return { item, agent, from, to: 'doing', changed }
}

export async function releaseItem(
  vault: Vault,
  ref: string,
  reason: string,
  where?: string,
): Promise<ReleaseChange> {
  const item = vault.resolve(ref)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be released.`)
  let agent = ''
  let from = item.status
  const note = () => `- ${today()} Released from ${agent}: ${reason.replace(/\.$/, '')}.` +
    (where === undefined ? '' : ` Work: ${where.replace(/\.$/, '')}.`)
  await editItem(item, (text) => {
    const state = cardState(text)
    if (state.agent === undefined) throw new Error(`${item.relPath} has no agent to release.`)
    agent = state.agent
    from = state.status
    return releaseEdits(state.status, state.hasPrevStatus)
  }, (text) => appendNote(text, note()))
  return { item, agent, from, to: 'options', reason, where, changed: true }
}
