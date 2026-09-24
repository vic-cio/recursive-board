/**
 * `wi area` — convert a work item between a card and an ongoing area.
 *
 * The operation changes one item's frontmatter. It keeps the body and every unrelated key, and
 * refuses to discard an active claim or in-progress status when converting a card to an area.
 */
import { editItem } from '../write.ts'
import { isStatus, STATUSES, type Status } from '../../shared/schema.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface AreaOptions {
  off: boolean
  status?: string
}

export interface AreaChange {
  item: WorkItem
  from: 'card' | 'area'
  to: 'card' | 'area'
  status: Status | undefined
  changed: boolean
}

export async function setArea(vault: Vault, ref: string, options: AreaOptions): Promise<AreaChange> {
  const item = vault.resolve(ref)
  if (item.parent === null) {
    throw new Error(`${item.relPath} is a root, and a root is not a card or area child.`)
  }

  if (options.off) {
    if (!item.area) throw new Error(`${item.relPath} is not an area. Nothing to convert back to a card.`)
    if (options.status === undefined) {
      throw new Error('converting an area back to a card needs --status <status>.')
    }
    if (!isStatus(options.status)) {
      throw new Error(`"${options.status}" is not a status. Use one of: ${STATUSES.join(', ')}.`)
    }
    const edits = [
      { op: 'remove' as const, key: 'area' },
      { op: 'set' as const, key: 'status', value: options.status },
      { op: 'remove' as const, key: 'prev_status' },
    ]
    const before = item.text
    const after = await editItem(item, edits)
    return { item, from: 'area', to: 'card', status: options.status, changed: before !== after }
  }

  if (options.status !== undefined) {
    throw new Error('--status applies only when converting an area back with --off.')
  }
  if (item.area) throw new Error(`${item.relPath} is already an area.`)
  if (item.status === 'doing') {
    throw new Error(`${item.relPath} is in doing. Move it out of doing before converting it to an area.`)
  }
  const agent = item.frontmatter.get('agent')
  if (typeof agent === 'string' && agent.trim() !== '') {
    throw new Error(`${item.relPath} has agent "${agent}". Release it before converting it to an area.`)
  }

  const edits = [
    { op: 'set' as const, key: 'area', value: true },
    { op: 'remove' as const, key: 'status' },
    { op: 'remove' as const, key: 'prev_status' },
  ]
  const before = item.text
  const after = await editItem(item, edits)
  return { item, from: 'card', to: 'area', status: undefined, changed: before !== after }
}
