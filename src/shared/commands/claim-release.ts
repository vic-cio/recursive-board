import { openWaits, titleOf } from '../item-dependencies.ts'
import { waitingRefusal } from '../dependencies.ts'
import { editItem } from '../edit-item.ts'
import { claimEdits, releaseEdits } from '../transitions.ts'
import { appendNote, noteLine } from '../notes.ts'
import { cardState } from '../card-state.ts'
import { applyEdits, type Edit } from '../edits.ts'
import { holds, assigneesIn, assigneesLabel, sameName } from '../assignee.ts'
import { today, type Status } from '../schema.ts'
import { loadVault, maxAgentsForRun, type Vault, type WorkItem } from '../vault.ts'
import { authorLabel } from '../authorship.ts'
import { activeAgentsOf } from './agents.ts'
import { UsageError, type RunFunction } from './command.ts'
import { envText, refOf, singleLineOption } from './options.ts'
import { json, label } from './output.ts'

export interface ClaimChange {
  item: WorkItem
  /** The claimant. */
  name: string
  /** The card's assignees after the claim. */
  assignees: string[]
  from: Status | undefined
  to: 'doing'
  changed: boolean
}

export interface ReleaseChange {
  item: WorkItem
  /** The assignee that gave the card up. */
  name: string
  /** The assignees that remain. */
  assignees: string[]
  from: Status | undefined
  /** The status after the release: options when no named assignee remains, else as it was. */
  to: Status | undefined
  reason: string
  where: string | undefined
  changed: true
}

/**
 * The claim is decided under the lock, from the card as it is then
 * (docs/adr/0054-edits-from-the-file-at-write-time.md): of two agents that claim one card at once,
 * the second finds the first one's name and is refused. Other cards, such as the dependencies and
 * the children, come from the loaded vault. `editBody` adds a body change to the same write.
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
  let assignees: string[] = []
  await editItem(vault, item, (text) => {
    from = cardState(text).status
    const edits = rule(text)
    changed = edits !== null
    assignees = assigneesIn(edits === null ? text : applyEdits(text, edits))
    return edits
  }, editBody)
  return { item, name: agent, assignees, from, to: 'doing', changed }
}

/**
 * Every check `wi claim` makes, as a rule on the card's text: an area, a root, an open wait,
 * another assignee, a done card, a board with a child in doing that someone else works.
 */
export function claimRule(vault: Vault, item: WorkItem, agent: string): (text: string) => Edit[] | null {
  if (item.area) throw new Error(`${item.relPath} is an area, and an area cannot be claimed.`)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be claimed.`)
  const otherDoingChild = vault.childrenOf(item).some((child) =>
    child.status === 'doing' && !holds(assigneesIn(child.text), agent))
  return (text) => {
    const state = cardState(text)
    const assigned = holds(state.assignees, agent) && state.status === 'doing'
    // An assignee keeps its claim on a doing card that waits, for example on a person's review.
    const waiting = assigned ? { cards: [], people: [] } : openWaits(vault, item, text)
    if (waiting.cards.length + waiting.people.length > 0) {
      throw new Error(waitingRefusal(item.relPath, waiting.cards.map(titleOf), waiting.people))
    }
    return claimEdits(state.status, state.assignees, agent, state.hasPrevStatus, state.board && otherDoingChild)
  }
}

export interface ReleaseOptions {
  where?: string | undefined
  /** Who signs the note. Defaults to the assignee that gives the card up. */
  writer?: string | undefined
  /** The assignee to remove, from --holder. */
  name?: string | undefined
  /** The caller's own name, from WI_AGENT. It is the default assignee to remove when it is assigned to the card. */
  caller?: string | undefined
}

/**
 * Which assignee a release removes: the one named, else the caller when it is assigned to the card,
 * else the only assignee. A card with several assignees and no name to choose by is refused.
 */
export function releasedAssignee(path: string, assignees: readonly string[], options: Pick<ReleaseOptions, 'name' | 'caller'>): string {
  if (assignees.length === 0) throw new Error(`${path} has no assignee to release.`)
  const named = options.name?.trim()
  if (named) {
    const found = assignees.find((name) => sameName(name, named))
    if (found === undefined) throw new Error(`${named} is not assigned to ${path}. Its assignees: ${assigneesLabel(assignees)}.`)
    return found
  }
  const caller = options.caller?.trim()
  const self = caller ? assignees.find((name) => sameName(name, caller)) : undefined
  if (self !== undefined) return self
  if (assignees.length === 1) return assignees[0]!
  throw new Error(`${path} has several assignees: ${assigneesLabel(assignees)}. Name the one to release with --holder <name>.`)
}

export async function releaseItem(vault: Vault, ref: string, reason: string, options: ReleaseOptions = {}): Promise<ReleaseChange> {
  const { where, writer } = options
  const item = vault.resolve(ref)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be released.`)
  let name = ''
  let assignees: string[] = []
  let from = item.status
  let to: Status | undefined
  // Signed and timed like every wi note, so the hand-over reads like the rest of Notes.
  const note = () => noteLine(`Released from ${name}: ${reason.replace(/\.$/, '')}.` +
    (where === undefined ? '' : ` Work: ${where.replace(/\.$/, '')}.`), writer?.trim() || name, vault.seams.now())
  await editItem(vault, item, (text) => {
    const state = cardState(text)
    name = releasedAssignee(item.relPath, state.assignees, options)
    from = state.status
    const edits = releaseEdits(state.status, state.assignees, name, state.hasPrevStatus)
    const after = cardState(applyEdits(text, edits))
    assignees = after.assignees
    to = after.status
    return edits
  }, (text) => appendNote(text, note()))
  return { item, name, assignees, from, to, reason, where, changed: true }
}

/** `wi claim <ref>`: by --assignee, by the legacy --holder, or by the agent's own name in WI_AGENT. */
export const runClaim: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  if (ref === '') throw new UsageError('wi claim needs a <ref> and --assignee <name>, or WI_AGENT set.')
  // An agent claims by its own name, which its session sets in WI_AGENT.
  const agent = line.values['assignee'] === undefined && line.values['holder'] === undefined
    ? envText(context, 'WI_AGENT')
    : singleLineOption(line.values, line.values['assignee'] === undefined ? 'holder' : 'assignee')
  if (agent === undefined) throw new UsageError('wi claim needs --assignee <name>, or WI_AGENT set.')
  const vault = await context.vault()
  const maxAgents = maxAgentsForRun(vault, context.env)
  const before = maxAgents === null ? new Set<string>() : await activeAgentsOf(vault)
  const change = await claimItem(vault, ref, agent)
  if (line.values['json'] === true) context.out(json({ id: change.item.id, path: change.item.relPath, name: change.name,
    assignees: change.assignees, from: change.from ?? null, to: change.to, changed: change.changed }))
  else context.out(change.changed
    ? `${label(change.item)}  ${change.from ?? '—'} → doing  (${change.assignees.length > 1 ? `assignees: ${assigneesLabel(change.assignees)}` : `assignee: ${agent}`})\n`
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

/** `wi release <ref> --reason <text> [--where <branch-or-path>] [--holder <name>]`. */
export const runRelease: RunFunction = async (context, line) => {
  const ref = refOf(line.positionals)
  if (ref === '') throw new UsageError('wi release needs a <ref> and --reason <text>.')
  const reason = singleLineOption(line.values, 'reason')
  const where = line.values['where'] === undefined ? undefined : singleLineOption(line.values, 'where')
  const holder = line.values['holder'] === undefined ? undefined : singleLineOption(line.values, 'holder')
  const caller = envText(context, 'WI_AGENT')
  const writer = authorLabel(caller, envText(context, 'WI_MODEL'))
  const change = await releaseItem(await context.vault(), ref, reason, { where, writer, name: holder, caller })
  if (line.values['json'] === true) context.out(json({ id: change.item.id, path: change.item.relPath, name: change.name,
    assignees: change.assignees, from: change.from ?? null, to: change.to ?? null, reason: change.reason,
    where: change.where ?? null, changed: change.changed }))
  else if (change.assignees.length > 0 && change.to === change.from) {
    context.out(`${label(change.item)}  ${change.from ?? '—'}  (released ${change.name}; assignees: ${assigneesLabel(change.assignees)})\n`)
  } else context.out(`${label(change.item)}  ${change.from ?? '—'} → ${change.to ?? '—'}  (released ${change.name})\n`)
  return 0
}
