import type { WorkItemMeta } from '../index.ts'
import type { RenderContext } from './context.ts'

export function showingArchived(ctx: RenderContext, parent: WorkItemMeta): boolean {
  return ctx.isShowingArchived(parent.file.path)
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
    text: `${count} archived${showingArchived(ctx, parent) ? ' · hide' : ''}`,
  })
  button.setAttr('aria-expanded', String(showingArchived(ctx, parent)))
  button.addEventListener('click', () => ctx.toggleArchived(parent.file.path))
}
