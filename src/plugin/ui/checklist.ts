/**
 * The checklist view.
 *
 * Decision U1: opening a work item shows its children as a checklist, not as a board. The spec
 * said a work item with children always renders a board; implemented literally that produces a
 * kanban repeated at every depth, which was built into the test vault and rejected on sight.
 *
 * Decision u6: this is also what a board looks like on a phone. Four status headings in one
 * scrolling list. (Reversed by `docs/phone-board-design.md`: a promoted board is tabs there now.)
 *
 * Decision R1: the rows are generated Markdown, rendered by Obsidian, so the list has the vault's
 * own typography, task checkboxes and internal links. The plugin intercepts the checkbox, because
 * the Markdown has no source file for Obsidian to write back to, and routes it to the same status
 * write the CLI makes. Badges and controls are appended to each rendered row afterwards.
 */
import { Component, MarkdownRenderer } from 'obsidian'

import { checklistMarkdown } from '../../shared/checklist.ts'
import { toColumns, type WorkItemMeta } from '../index.ts'
import { renderAddRow, renderHiddenNote } from './add-row.ts'
import { renderArchiveNote, showingArchived } from './archive-note.ts'
import { renderLabels, renderRemove } from './card.ts'
import type { RenderContext } from './context.ts'
import { attachMenu, renderMenuButton } from './menu.ts'
import { statusLabel } from './status-label.ts'

export interface ChecklistOptions {
  /** True to split the list under the four status headings, which is the mobile board. */
  grouped: boolean
  /**
   * The item these children hang off, when the view may create more of them.
   * Omitted inside an expanded card, where an add row would nest a capture surface in a card.
   */
  parent?: WorkItemMeta | undefined
  archiveParent?: WorkItemMeta | undefined
}

export function renderChecklist(
  host: HTMLElement,
  ctx: RenderContext,
  children: WorkItemMeta[],
  options: ChecklistOptions,
): void {
  const parent = options.parent
  const archiveParent = options.archiveParent ?? parent
  const showArchived = archiveParent ? showingArchived(ctx, archiveParent) : false
  const archivedCount = children.filter((c) => c.effectiveArchived).length

  if (!options.grouped) {
    const visible = showArchived ? children : children.filter((c) => !c.effectiveArchived)
    if (visible.length === 0) host.createDiv({ cls: 'wi-empty', text: 'No children yet.' })
    else renderRows(host, ctx, visible)
    // A checklist has no columns, so a new item lands in backlog, the creation default.
    if (parent) renderAddRow(host, ctx, parent, 'backlog')
    if (archiveParent) renderArchiveNote(host, ctx, archiveParent, archivedCount)
    return
  }

  for (const column of toColumns(children, new Date(), showArchived)) {
    const rows = column.visible
    // Every status gets a group when the view can create into it, so the phone can capture.
    if (rows.length === 0 && column.hidden === 0 && !parent) continue
    const group = host.createDiv({ cls: 'wi-group' })
    group.createDiv({
      cls: `wi-group-heading is-${column.status}`,
      text: `${statusLabel(column.status)} (${rows.length})`,
    })
    if (rows.length > 0) renderRows(group, ctx, rows)
    if (column.hidden > 0) renderHiddenNote(group, column.hidden)
    if (parent) renderAddRow(group, ctx, parent, column.status)
  }
  if (archiveParent) renderArchiveNote(host, ctx, archiveParent, archivedCount)
}

/**
 * Each rendered list owns a component, which is what the renderer registers its children on. A
 * list is dropped whenever its region redraws, and its component is then released.
 */
export class ChecklistComponents {
  private readonly live = new Map<HTMLElement, Component>()

  add(el: HTMLElement, component: Component): void {
    this.live.set(el, component)
  }

  has(el: HTMLElement): boolean {
    return this.live.has(el)
  }

  release(el: HTMLElement): void {
    const component = this.live.get(el)
    if (!component) return
    component.unload()
    this.live.delete(el)
  }

  releaseDisconnected(): void {
    for (const el of this.live.keys()) {
      if (el.isConnected) continue
      this.release(el)
    }
  }

  releaseAll(): void {
    for (const component of this.live.values()) component.unload()
    this.live.clear()
  }
}

function renderRows(host: HTMLElement, ctx: RenderContext, children: WorkItemMeta[]): void {
  const list = host.createDiv({ cls: 'wi-checklist markdown-rendered' })
  const component = new Component()
  component.load()
  ctx.checklistComponents.add(list, component)

  const markdown = checklistMarkdown(children.map((meta) => ({
    title: meta.title,
    path: meta.file.path,
    done: meta.status === 'done',
  })))
  const sourcePath = children[0]?.file.path ?? ''

  void MarkdownRenderer.render(ctx.app, markdown, list, sourcePath, component).then(
    () => {
      if (!list.isConnected || !ctx.checklistComponents.has(list)) return
      const rows = [...list.querySelectorAll<HTMLElement>('li.task-list-item')]
      rows.forEach((row, i) => {
        const meta = children[i]
        if (meta) decorateRow(row, ctx, meta)
      })
    },
    () => ctx.checklistComponents.release(list),
  )
}

/** Wires one rendered row to its work item and appends the badges and controls. */
function decorateRow(row: HTMLElement, ctx: RenderContext, meta: WorkItemMeta): void {
  row.addClass('wi-check-row')
  row.toggleClass('is-blocked', meta.blocked)
  row.toggleClass('is-archived', meta.effectiveArchived)

  // Capture phase, so this runs before any handler Obsidian attached to the checkbox or the link.
  const box = row.querySelector<HTMLInputElement>('input.task-list-item-checkbox')
  if (box) {
    box.setAttribute('aria-label', `Mark ${meta.title} done`)
    box.addEventListener('click', (event) => {
      event.stopPropagation()
      // The box has already toggled by the time click fires. Decision U2: unticking restores
      // exactly what the item was.
      void ctx.actions.setDone(meta, box.checked)
    }, { capture: true })
  }

  const link = row.querySelector<HTMLAnchorElement>('a.internal-link')
  if (link) {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void ctx.actions.open(meta, event.metaKey || event.ctrlKey)
    }, { capture: true })
    link.addEventListener('mouseover', (event) => {
      ctx.app.workspace.trigger('hover-link', {
        event,
        source: 'preview',
        hoverParent: ctx.component,
        targetEl: link,
        linktext: meta.file.path,
        sourcePath: meta.file.path,
      })
    })
  }

  const extras = row.createSpan({ cls: 'wi-row-extras' })
  if (meta.status !== undefined && meta.status !== 'done') {
    extras.createSpan({ cls: `wi-check-status is-${meta.status}`, text: statusLabel(meta.status) })
  }
  if (meta.labels.length > 0) renderLabels(extras.createSpan({ cls: 'wi-labels' }), meta.labels)
  const children = ctx.index.childCount(meta.file)
  if (children > 0) extras.createSpan({ cls: 'wi-check-count', text: `${children}` })
  if (meta.blocked) extras.createSpan({ cls: 'wi-check-blocked', text: 'Blocked' })
  renderMenuButton(extras, ctx, meta)
  renderRemove(extras, ctx, meta)
  attachMenu(row, ctx, meta)
}
