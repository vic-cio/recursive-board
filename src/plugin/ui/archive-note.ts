import type { WorkItemMeta } from '../index.ts'
import type { RenderContext } from './context.ts'

/** A view preference for each parent, discarded when the plugin session ends. */
const shown = new Set<string>()

export function showingArchived(parent: WorkItemMeta): boolean {
  return shown.has(parent.file.path)
}

export function renderArchiveNote(
  host: HTMLElement,
  ctx: RenderContext,
  parent: WorkItemMeta,
  count: number,
): void {
  if (count === 0) return
  const button = host.createEl('button', {
    cls: 'wi-archive-toggle',
    text: `${count} archived${showingArchived(parent) ? ' · hide' : ''}`,
  })
  button.setAttr('aria-expanded', String(showingArchived(parent)))
  button.addEventListener('click', () => {
    if (shown.has(parent.file.path)) shown.delete(parent.file.path)
    else shown.add(parent.file.path)
    ctx.refresh()
  })
}
