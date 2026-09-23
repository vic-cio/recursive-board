/**
 * The four-column board.
 *
 * Decision U1: this renders only when an item carries `board: true`.
 *
 * On a phone the four columns become four tabs over one group of cards
 * (`docs/phone-board-design.md`). Every count shows at once, so an empty Doing costs a glance,
 * and any group is one tap away. This reverses decision u6, which made the phone board a grouped
 * checklist: the maintainer, looking at it, said the current state is not desired.
 *
 * Decision u7 puts an add row at the foot of every column. Typing into Options and pressing enter
 * is one action where any dialog is at least four, and that difference decides whether half-formed
 * items get written down at all.
 */
import { Platform } from 'obsidian'

import type { Status } from '../../shared/schema.ts'
import { toColumns, type Column, type WorkItemMeta } from '../index.ts'
import { renderAddRow, renderHiddenNote } from './add-row.ts'
import { renderCard } from './card.ts'
import type { RenderContext } from './context.ts'

export function renderBoard(
  host: HTMLElement,
  ctx: RenderContext,
  parent: WorkItemMeta,
  children: WorkItemMeta[],
): void {
  const columns = toColumns(children)
  if (Platform.isMobile) {
    renderTabbed(host.createDiv({ cls: 'wi-tabbed' }), ctx, parent, columns)
    return
  }
  const board = host.createDiv({ cls: 'wi-board' })
  for (const column of columns) {
    renderColumn(board, ctx, parent, column.status, column.visible, column.hidden)
  }
}

/**
 * The tab each phone board was last showing, by the board's path. Session state, never written:
 * without it every redraw, including the one an add row causes, would jump to another tab.
 */
const shownTab = new Map<string, Status>()

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
  const shown = shownTab.get(parent.file.path) ?? defaultTab(columns)

  const tabs = host.createDiv({ cls: 'wi-tabs', attr: { role: 'tablist' } })
  for (const column of columns) {
    const active = column.status === shown
    const tab = tabs.createEl('button', { cls: `wi-tab is-${column.status}`, attr: { role: 'tab' } })
    tab.toggleClass('is-active', active)
    tab.setAttr('aria-selected', String(active))
    tab.createSpan({ cls: 'wi-tab-name', text: column.status })
    tab.createSpan({ cls: 'wi-tab-count', text: String(column.visible.length) })
    tab.addEventListener('click', () => {
      shownTab.set(parent.file.path, column.status)
      renderTabbed(host, ctx, parent, columns)
    })
  }

  const column = columns.find((c) => c.status === shown) ?? columns[0]!
  const board = host.createDiv({ cls: 'wi-board' })
  renderColumn(board, ctx, parent, column.status, column.visible, column.hidden)
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
  header.createSpan({ cls: 'wi-column-name', text: status })
  header.createSpan({ cls: 'wi-column-count', text: String(cards.length) })

  const stack = column.createDiv({ cls: 'wi-stack' })
  for (const meta of cards) renderCard(stack, ctx, meta, { draggable: true })
  if (hidden > 0) renderHiddenNote(stack, hidden)

  if (!Platform.isMobile) acceptDrops(column, stack, ctx, status)
  renderAddRow(column, ctx, parent, status)
}

/**
 * Decision q5: plain HTML5 drag events, desktop only.
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
    // A drop changes the child's status. Nothing else, and never the parent.
    if (meta) void ctx.actions.setStatus(meta, status)
  })
  void stack
}
