import { openDependencies, titleOf } from '../dependencies.ts'
import { waitingRefusal } from '../../shared/dependencies.ts'
import { editItem } from '../write.ts'
import { claimEdits, releaseEdits } from '../../shared/transitions.ts'
import { appendNote } from '../../shared/notes.ts'
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

export async function claimItem(vault: Vault, ref: string, agent: string): Promise<ClaimChange> {
  const item = vault.resolve(ref)
  if (item.area) throw new Error(`${item.relPath} is an area, and an area cannot be claimed.`)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be claimed.`)
  const current = item.frontmatter.get('agent')
  const currentAgent = typeof current === 'string' && current.trim() !== '' ? current : undefined
  const holding = currentAgent === agent && item.status === 'doing'
  if (!holding && item.frontmatter.get('blocked') === true) {
    throw new Error(`${item.relPath} is blocked. Clear its blocked flag when the block is gone, or claim another card.`)
  }
  const waiting = holding ? [] : openDependencies(vault, item)
  if (waiting.length > 0) throw new Error(waitingRefusal(item.relPath, waiting.map(titleOf)))
  const edits = claimEdits(
    item.status, currentAgent, agent, item.frontmatter.has('prev_status'),
    item.board && vault.childrenOf(item).some((child) =>
      child.status === 'doing' && child.frontmatter.get('agent') !== agent),
  )
  if (edits === null) return { item, agent, from: item.status, to: 'doing', changed: false }
  await editItem(item, edits)
  return { item, agent, from: item.status, to: 'doing', changed: true }
}

export async function releaseItem(
  vault: Vault,
  ref: string,
  reason: string,
  where?: string,
): Promise<ReleaseChange> {
  const item = vault.resolve(ref)
  if (item.parent === null) throw new Error(`${item.relPath} is a root, and a root cannot be released.`)
  const current = item.frontmatter.get('agent')
  if (typeof current !== 'string' || current.trim() === '') {
    throw new Error(`${item.relPath} has no agent to release.`)
  }
  const note = `- ${today()} Released from ${current}: ${reason.replace(/\.$/, '')}.` +
    (where === undefined ? '' : ` Work: ${where.replace(/\.$/, '')}.`)
  await editItem(item, releaseEdits(item.status, item.frontmatter.has('prev_status')),
    (text) => appendNote(text, note))
  return { item, agent: current, from: item.status, to: 'options', reason, where, changed: true }
}
