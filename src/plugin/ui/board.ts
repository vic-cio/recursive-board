/**
 * The four-column board.
 *
 * docs/adr/0015-checklist-and-board-navigation.md: this renders only when an item carries `board: true`.
 *
 * On a phone the four columns become four tabs over one group of cards
 * (`docs/adr/0022-phone-board-navigation.md`). Every count shows at once, so an empty Doing costs a glance,
 * and any group is one tap away. Status tabs replace the earlier grouped
 * checklist.
 *
 * Each column has an add row (docs/adr/0017-inline-status-capture.md). Typing into Options and pressing enter
 * is one action where any dialog is at least four, and that difference decides whether half-formed
 * items get written down at all.
 */
import { Platform } from 'obsidian'

import type { Status } from '../../shared/schema.ts'
import { toAreas, toColumns, type AreaSummary, type Column, type WorkItemMeta } from '../index.ts'
import { renderAddRow, renderHiddenNote } from './add-row.ts'
import { renderArchiveNote, showingArchived } from './archive-note.ts'
import { renderCard } from './card.ts'
import { tabArchivedCount } from './tab-archived-count.ts'
import { renderSelfCard } from './self-card.ts'
import { attachMenu } from './menu.ts'
import type { RenderContext } from './context.ts'
import { statusLabel } from './status-label.ts'

export function renderBoard(
  host: HTMLElement,
  ctx: RenderContext,
  parent: WorkItemMeta,
  children: WorkItemMeta[],
): void {
  const columns = toColumns(children, new Date(), showingArchived(ctx, parent))
  const areas = toAreas(parent, (item) => ctx.index.childrenOf(item.file), showingArchived(ctx, parent))
  // The phone shows the same strip as the desktop, above its tabs (docs/adr/0073-area-chips-live-on-the-root-board.md).
  if (areas.length > 0) renderAreaStrip(host, ctx, parent, areas)
  if (Platform.isMobile) {
    renderTabbed(host.createDiv({ cls: 'wi-tabbed' }), ctx, parent, columns)
    return
  }
  const board = host.createDiv({ cls: 'wi-board' })
  for (const column of columns) {
    renderColumn(board, ctx, parent, column.status, column.visible, column.hidden)
  }
  renderArchiveNote(host, ctx, parent, children.filter((c) => c.effectiveArchived).length)
}

/** Doing when anything is in it, because that is what you open a board to see. */
function defaultTab(columns: Column[]): Status {
  return columns.some((c) => c.status === 'doing' && c.visible.length > 0) ? 'doing' : 'backlog'
}

function renderTabbed(
  host: HTMLElement,
  ctx: RenderContext,
  parent: WorkItemMeta,
  columns: Column[],
): void {
  host.empty()
  const shown = ctx.selectedTab(parent.file.path) ?? defaultTab(columns)

  const tabs = host.createDiv({ cls: 'wi-tabs', attr: { role: 'tablist' } })
  for (const column of columns) {
    const active = column.status === shown
    const tab = tabs.createEl('button', { cls: `wi-tab is-${column.status}`, attr: { role: 'tab' } })
    tab.toggleClass('is-active', active)
    tab.setAttr('aria-selected', String(active))
    tab.createSpan({ cls: 'wi-tab-name', text: statusLabel(column.status) })
    tab.createSpan({ cls: 'wi-tab-count', text: String(column.visible.length) })
    tab.addEventListener('click', () => {
      ctx.selectTab(parent.file.path, column.status)
      renderTabbed(host, ctx, parent, columns)
      ctx.checklistComponents.releaseDisconnected()
    })
  }

  const column = columns.find((c) => c.status === shown) ?? columns[0]!
  const board = host.createDiv({ cls: 'wi-board' })
  renderColumn(board, ctx, parent, column.status, column.visible, column.hidden)
  // The button counts the shown tab only: archived cards of another tab would not appear on screen.
  renderArchiveNote(host, ctx, parent, tabArchivedCount(columns, column.status))
}

function renderAreaStrip(host: HTMLElement, ctx: RenderContext, root: WorkItemMeta, areas: AreaSummary[]): void {
  const strip = host.createDiv({ cls: 'wi-area-strip', attr: { 'aria-label': 'Areas' } })
  for (const { meta, parent, doingCount } of areas) {
    const chip = strip.createEl('button', { cls: 'wi-area-chip' })
    chip.setAttr('aria-label', `${meta.title}, ${doingCount} Doing`)
    // A chip for an area deeper in the tree says where it lives. The area's own card in that board has the ⋯ button.
    if (parent !== root) chip.setAttr('title', `In ${parent.title}`)
    chip.createSpan({ cls: 'wi-area-title', text: meta.title })
    chip.createSpan({ cls: 'wi-area-count', text: String(doingCount) })
    chip.addEventListener('click', (event) => {
      event.preventDefault()
      void ctx.actions.open(meta, event.metaKey || event.ctrlKey)
    })
    attachMenu(chip, ctx, meta)
  }
}

function renderColumn(
  board: HTMLElement,
  ctx: RenderContext,
  parent: WorkItemMeta,
  status: Status,
  cards: WorkItemMeta[],
  hidden: number,
): void {
  const column = board.createDiv({ cls: `wi-column is-${status}` })
  const header = column.createDiv({ cls: 'wi-column-header' })
  header.createSpan({ cls: 'wi-column-name', text: statusLabel(status) })
  header.createSpan({ cls: 'wi-column-count', text: String(cards.length) })

  const stack = column.createDiv({ cls: 'wi-stack' })
  for (const meta of cards) renderCard(stack, ctx, meta, { draggable: true })
  renderSelfCard(stack, ctx, parent, status)
  if (hidden > 0) renderHiddenNote(stack, hidden)

  if (!Platform.isMobile) acceptDrops(column, stack, ctx, status)
  renderAddRow(column, ctx, parent, status)
}

/**
 * HTML5 drag events work on desktop; phone actions use the item menu.
 * Keeping drag off mobile means this stays about fifty lines instead of being a pointer-event
 * state machine handling touch, scroll and cancel.
 */
function acceptDrops(
  column: HTMLElement,
  stack: HTMLElement,
  ctx: RenderContext,
  status: Status,
): void {
  let depth = 0
  const leave = () => {
    depth = 0
    column.removeClass('is-drop-target')
  }

  column.addEventListener('dragenter', (event) => {
    event.preventDefault()
    depth += 1
    column.addClass('is-drop-target')
  })
  column.addEventListener('dragover', (event) => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  })
  column.addEventListener('dragleave', () => {
    depth -= 1
    if (depth <= 0) leave()
  })
  column.addEventListener('drop', (event) => {
    event.preventDefault()
    leave()
    const path = event.dataTransfer?.getData('text/plain')
    if (!path) return
    const file = ctx.app.vault.getFileByPath(path)
    const meta = ctx.index.get(file)
    // A drop changes the dropped card's status and nothing else. The parent changes only when
    // its own self-card is the card dropped (docs/adr/0074-an-area-shows-itself-in-its-own-board.md).
    if (meta) void ctx.actions.setStatus(meta, status)
  })
  void stack
}
