import { openDependencies, titleOf } from '../dependencies.ts'
import { waitingRefusal } from '../../shared/dependencies.ts'
import { editItem } from '../write.ts'
import { claimEdits, releaseEdits } from '../../shared/transitions.ts'
import { appendNote } from '../../shared/notes.ts'
import { cardState } from '../../shared/card-state.ts'
import type { Edit } from '../../shared/edits.ts'
import { holderOf } from '../../shared/holder.ts'
import { today, type Status } from '../../shared/schema.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface ClaimChange {
  item: WorkItem
  holder: string
  from: Status | undefined
  to: 'doing'
  changed: boolean
}

export interface ReleaseChange {
  item: WorkItem
  holder: string
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
  const rule = claimRule(vault, item, agent)
  let from = item.status
  let changed = false
  await editItem(item, (text) => {
    from = cardState(text).status
    const edits = rule(text)
    changed = edits !== null
    return edits
  }, editBody)
  return { item, holder: agent, from, to: 'doing', changed }
}

/**
 * Every check `wi claim` makes, as a rule on the card's text: an area, a root, an open dependency,
 * another holder, a done card, a board with a child in doing that someone else works. `wi delegate`
 * runs it before it names a worker, so a worker never starts on a card it cannot claim.
 */
export function claimRule(vault: Vault, item: WorkItem, agent: string): (text: string) => Edit[] | null {
  if (item.area) throw new Error(`${item.relPath} is an area, and an area cannot be claimed.`)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be claimed.`)
  const otherDoingChild = vault.childrenOf(item).some((child) =>
    child.status === 'doing' && holderOf((key) => child.frontmatter.get(key)) !== agent)
  return (text) => {
    const state = cardState(text)
    const holding = state.holder === agent && state.status === 'doing'
    const waiting = holding ? [] : openDependencies(vault, item, text)
    if (waiting.length > 0) throw new Error(waitingRefusal(item.relPath, waiting.map(titleOf)))
    return claimEdits(state.status, state.holder, agent, state.hasPrevStatus, state.board && otherDoingChild)
  }
}

export async function releaseItem(
  vault: Vault,
  ref: string,
  reason: string,
  where?: string,
): Promise<ReleaseChange> {
  const item = vault.resolve(ref)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be released.`)
  let holder = ''
  let from = item.status
  const note = () => `- ${today()} Released from ${holder}: ${reason.replace(/\.$/, '')}.` +
    (where === undefined ? '' : ` Work: ${where.replace(/\.$/, '')}.`)
  await editItem(item, (text) => {
    const state = cardState(text)
    if (state.holder === undefined) throw new Error(`${item.relPath} has no holder to release.`)
    holder = state.holder
    from = state.status
    return releaseEdits(state.status, state.hasPrevStatus)
  }, (text) => appendNote(text, note()))
  return { item, holder, from, to: 'options', reason, where, changed: true }
}
