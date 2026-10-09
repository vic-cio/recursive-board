import { openDependencies, titleOf } from '../item-dependencies.ts'
import { waitingRefusal } from '../dependencies.ts'
import { editItem } from '../edit-item.ts'
import { claimEdits, releaseEdits } from '../transitions.ts'
import { appendNote, noteLine } from '../notes.ts'
import { cardState } from '../card-state.ts'
import type { Edit } from '../edits.ts'
import { holderOf } from '../holder.ts'
import { today, type Status } from '../schema.ts'
import { loadVault, maxAgentsForRun, type Vault, type WorkItem } from '../vault.ts'
import { authorLabel } from '../authorship.ts'
import { activeAgentsOf } from './agents.ts'
import { UsageError, type RunFunction } from './command.ts'
import { envText, refOf, singleLineOption } from './options.ts'
import { json, label } from './output.ts'

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
  await editItem(vault, item, (text) => {
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
  /** Who signs the note. Defaults to the holder that gives the card up. */
  writer?: string,
): Promise<ReleaseChange> {
  const item = vault.resolve(ref)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be released.`)
  let holder = ''
  let from = item.status
  // Signed and timed like every wi note, so the hand-over reads like the rest of Notes.
  const note = () => noteLine(`Released from ${holder}: ${reason.replace(/\.$/, '')}.` +
    (where === undefined ? '' : ` Work: ${where.replace(/\.$/, '')}.`), writer?.trim() || holder, vault.seams.now())
  await editItem(vault, item, (text) => {
    const state = cardState(text)
    if (state.holder === undefined) throw new Error(`${item.relPath} has no holder to release.`)
    holder = state.holder
    from = state.status
    return releaseEdits(state.status, state.hasPrevStatus)
  }, (text) => appendNote(text, note()))
  return { item, holder, from, to: 'options', reason, where, changed: true }
}

/** `wi claim <ref>`: by --holder, or by the agent's own name in WI_AGENT. */
export const runClaim: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  if (ref === '') throw new UsageError('wi claim needs a <ref> and --holder <name>, or WI_AGENT set.')
  // An agent claims by its own name, which its session sets in WI_AGENT.
  const agent = line.values['holder'] === undefined ? envText(context, 'WI_AGENT') : singleLineOption(line.values, 'holder')
  if (agent === undefined) throw new UsageError('wi claim needs --holder <name>, or WI_AGENT set.')
  const vault = await context.vault()
  const maxAgents = maxAgentsForRun(vault, context.env)
  const before = maxAgents === null ? new Set<string>() : await activeAgentsOf(vault)
  const change = await claimItem(vault, ref, agent)
  if (line.values['json'] === true) context.out(json({ id: change.item.id, path: change.item.relPath, holder: change.holder,
    from: change.from ?? null, to: change.to, changed: change.changed }))
  else context.out(change.changed
    ? `${label(change.item)}  ${change.from ?? '—'} → doing  (holder: ${agent})\n`
    : `${label(change.item)} is already claimed by ${agent} in doing. Nothing written.\n`)
  if (change.changed && maxAgents !== null) {
    // Count after the claim: it can move a step to doing and leave the parent's agent only waiting.
    // A person, a request for any agent, and an agent that only waits add no agent.
    const after = await activeAgentsOf(await loadVault(vault.port, vault.seams))
    const name = agent.trim().toLowerCase()
    if (!before.has(name) && after.has(name) && after.size > maxAgents) {
      context.err(`wi: warning: agent limit is ${maxAgents}; ${after.size} agents now work a doing card.\n`)
    }
  }
  return 0
}

/** `wi release <ref> --reason <text> [--where <branch-or-path>]`. */
export const runRelease: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  if (ref === '') throw new UsageError('wi release needs a <ref> and --reason <text>.')
  const reason = singleLineOption(line.values, 'reason')
  const where = line.values['where'] === undefined ? undefined : singleLineOption(line.values, 'where')
  const writer = authorLabel(envText(context, 'WI_AGENT'), envText(context, 'WI_MODEL'))
  const change = await releaseItem(await context.vault(), ref, reason, where, writer)
  if (line.values['json'] === true) context.out(json({ id: change.item.id, path: change.item.relPath, holder: change.holder,
    from: change.from ?? null, to: change.to, reason: change.reason, where: change.where ?? null,
    changed: change.changed }))
  else context.out(`${label(change.item)}  ${change.from ?? '—'} → options  (released ${change.holder})\n`)
  return 0
}
