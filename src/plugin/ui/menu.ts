/**
 * The right-click menu on a card or a checklist row.
 *
 * It holds every verb a work item has, so reparenting has a home that needs no drag, and so each
 * later verb has one obvious place to go. Each entry calls the same `Actions` method the board's
 * own controls call. The menu adds no rule of its own.
 *
 * iOS fires no `contextmenu` on a long press, so on the phone every card carries a "⋯" button
 * that opens the same menu. It is also the phone's way to change a card's status, because drag
 * is desktop only (decision q5).
 */
import { Menu, Notice, Platform, setIcon } from 'obsidian'

import { STATUSES } from '../../shared/schema.ts'
import type { WorkItemMeta } from '../index.ts'
import type { RenderContext } from './context.ts'
import { MoveModal } from './move-modal.ts'
import { statusLabel } from './status-label.ts'

/** Opens the menu for a work item on a right click. */
export function attachMenu(el: HTMLElement, ctx: RenderContext, meta: WorkItemMeta): void {
  el.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    event.stopPropagation() // A row inside an expanded card must not also open the card's menu.
    buildMenu(ctx, meta).showAtMouseEvent(event)
  })
}

/** The phone's way into the menu. Drawn only on mobile, where there is no right click. */
export function renderMenuButton(host: HTMLElement, ctx: RenderContext, meta: WorkItemMeta): void {
  if (!Platform.isMobile) return
  const button = host.createEl('button', { cls: 'wi-more' })
  setIcon(button, 'more-horizontal')
  button.setAttr('aria-label', `Actions for ${meta.title}`)
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation() // Never expand the card on the way to its menu.
    buildMenu(ctx, meta).showAtMouseEvent(event)
  })
}

function buildMenu(ctx: RenderContext, meta: WorkItemMeta): Menu {
  const menu = new Menu()

  menu.addItem((item) => item
    .setTitle('Open')
    .setIcon('file-text')
    .onClick(() => void ctx.actions.open(meta)))
  menu.addItem((item) => item
    .setTitle('Open in new tab')
    .setIcon('file-plus')
    .onClick(() => void ctx.actions.open(meta, true)))

  menu.addSeparator()
  menu.addItem((item) => item
    .setTitle(meta.effectiveArchived ? 'Unarchive' : 'Archive')
    .setIcon('archive')
    .onClick(() => void ctx.actions.setArchived(meta, !meta.effectiveArchived)))
  menu.addItem((item) => item
    .setTitle('Move to…')
    .setIcon('folder-input')
    .onClick(() => new MoveModal(ctx.app, ctx.index, ctx.actions, meta).open()))

  // A root takes no status (decision D7), so it gets no status entries.
  if (meta.parentLink !== null) {
    menu.addSeparator()
    for (const status of STATUSES) {
      menu.addItem((item) => item
        .setTitle(statusLabel(status))
        .setChecked(meta.status === status)
        .onClick(() => void ctx.actions.setStatus(meta, status)))
    }
  }

  menu.addSeparator()
  menu.addItem((item) => item
    .setTitle(meta.board ? 'Demote to checklist' : 'Promote to board')
    .setIcon('columns-3')
    .onClick(() => void ctx.actions.setPromoted(meta, !meta.board)))
  if (meta.id !== undefined) {
    const id = meta.id
    menu.addItem((item) => item
      .setTitle(`Copy ID (${id})`)
      .setIcon('copy')
      .onClick(() => void navigator.clipboard
        .writeText(id)
        .then(() => new Notice(`${id} copied`))
        .catch(() => new Notice(`Could not copy ${id}`))))
  }

  if (meta.parentLink !== null) {
    menu.addSeparator()
    menu.addItem((item) => item
      .setTitle('Remove')
      .setIcon('trash-2')
      .setWarning(true)
      .onClick(() => void ctx.actions.remove(meta)))
  }
  return menu
}
