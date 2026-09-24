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
  const edits = claimEdits(
    item.status, currentAgent, agent, item.frontmatter.has('prev_status'),
    item.board && vault.childrenOf(item).some((child) => child.status === 'doing'),
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
