/**
 * Putting the board into a note.
 *
 * docs/adr/0020-generated-markdown-and-note-view.md: the plugin detects `type: work-item` and renders into regions it owns, so no note
 * body carries query text and nothing goes dead the day Obsidian is replaced.
 *
 * There are two shapes.
 *
 * A **checklist** renders below the note body, inside Obsidian's own sizer
 * (`.markdown-preview-sizer` in reading mode, `.cm-sizer` in the editor). Both can exist at once
 * while a view switches mode, so both are mounted. Obsidian appends its own sections, such as
 * embedded backlinks, exactly this way. The Objective stays first, which is what the prototype
 * review asked for: on an unpromoted card the text is the point and the children are a footnote.
 *
 * A **board** takes the pane over, because a promoted item *is* a board and scrolling past the
 * properties and the body to reach it made the board the footnote instead.
 *
 * The takeover is an overlay on the view's content element rather than the note body being
 * hidden. Hiding `.cm-contentContainer` would leave CodeMirror measuring a zero-height document,
 * which is a class of bug that shows up later as scroll and cursor strangeness. An overlay
 * touches nothing Obsidian owns: the editor stays mounted, measured and correct, just behind.
 */
import { MarkdownView, Platform, type App, type WorkspaceLeaf } from 'obsidian'

import { renderBoard } from './ui/board.ts'
import { renderChecklist } from './ui/checklist.ts'
import { renderBreadcrumbs, renderMetaStrip } from './ui/chrome.ts'
import type { RenderContext } from './ui/context.ts'
import type { WorkItemMeta } from './index.ts'

const TOP = 'wi-region-top'
const BOTTOM = 'wi-region-bottom'
const REGION = 'wi-region'
const TAKEOVER = 'wi-takeover'
const HOST = 'wi-takeover-host'
/** Marks a view whose editor must stop growing to fill the pane. See the CSS for why. */
const REGION_HOST = 'wi-region-host'

/** Every sizer in a view. There may be two while the view is between modes. */
function sizersOf(view: MarkdownView): HTMLElement[] {
  return [...view.contentEl.querySelectorAll<HTMLElement>('.markdown-preview-sizer, .cm-sizer')]
}

/**
 * Obsidian's own trailing elements. `.mod-footer` carries the scroll-past-end space, so a region
 * appended after it opens a viewport-sized hole between the note and the board. The board also
 * belongs above the embedded backlinks, which are about the note rather than part of it.
 */
const TRAILING = '.mod-footer, .embedded-backlinks, .cm-footer'

function region(sizer: HTMLElement, cls: string, atTop: boolean): HTMLElement {
  const existing = sizer.querySelector<HTMLElement>(`:scope > .${cls}`)
  if (existing) {
    existing.empty()
    return existing
  }
  const el = createDiv({ cls: `${REGION} ${cls}` })
  if (atTop) {
    sizer.prepend(el)
    return el
  }
  const trailing = sizer.querySelector<HTMLElement>(`:scope > :is(${TRAILING})`)
  if (trailing) trailing.before(el)
  else sizer.append(el)
  return el
}

function clearSizers(view: MarkdownView): void {
  view.contentEl.removeClass(REGION_HOST)
  for (const el of view.contentEl.querySelectorAll(`.${REGION}`)) el.remove()
}

function clearTakeover(view: MarkdownView): void {
  view.contentEl.removeClass(HOST)
  for (const el of view.contentEl.querySelectorAll(`.${TAKEOVER}`)) el.remove()
}

function clear(view: MarkdownView): void {
  clearSizers(view)
  clearTakeover(view)
}

/** The overlay that a board fills. Reused across redraws so the scroll position survives. */
function takeoverLayer(view: MarkdownView): HTMLElement {
  view.contentEl.addClass(HOST)
  const existing = view.contentEl.querySelector<HTMLElement>(`:scope > .${TAKEOVER}`)
  if (existing) {
    existing.empty()
    return existing
  }
  return view.contentEl.createDiv({ cls: TAKEOVER })
}

/**
 * A phone floats its view header over the content, and Obsidian pads its own scroller to clear
 * it, per a layout report. The overlay sits at the top of the content, so it
 * copies that padding rather than guessing a number that changes with the device.
 */
function clearFloatingHeader(view: MarkdownView, layer: HTMLElement): void {
  if (!Platform.isMobile) return
  const scroller = view.contentEl.querySelector<HTMLElement>('.cm-scroller, .markdown-preview-view')
  layer.style.setProperty('--wi-float-top', scroller ? getComputedStyle(scroller).paddingTop : '0px')
}

/** Draws, or clears, the regions of one leaf. */
export function mountLeaf(leaf: WorkspaceLeaf, ctx: RenderContext): void {
  const view = leaf.view
  if (!(view instanceof MarkdownView) || !view.file) return

  const file = view.file
  const meta = ctx.index.get(file)
  if (!meta) {
    clear(view)
    return
  }

  // A promoted item is a board first on both devices (docs/adr/0022-phone-board-navigation.md).
  const takesOver = meta.board && !ctx.isPeeking(file.path)

  if (takesOver) {
    clearSizers(view)
    const layer = takeoverLayer(view)
    clearFloatingHeader(view, layer)
    renderBreadcrumbs(layer, ctx, meta)
    const body = layer.createDiv({ cls: 'wi-takeover-body' })
    renderMetaStrip(body, meta)
    renderBoard(body, ctx, meta, ctx.index.childrenOf(meta.file))
    return
  }

  clearTakeover(view)
  view.contentEl.addClass(REGION_HOST)
  for (const sizer of sizersOf(view)) {
    renderBreadcrumbs(region(sizer, TOP, true), ctx, meta)

    // The Objective is what you came to read, so everything else sits below the body.
    const bottom = region(sizer, BOTTOM, false)
    renderMetaStrip(bottom, meta)
    renderChecklist(bottom, ctx, ctx.index.childrenOf(meta.file), {
      grouped: meta.board,
      parent: meta,
      archiveParent: meta,
    })
  }
}

export function mountAll(app: App, ctx: RenderContext): void {
  for (const leaf of app.workspace.getLeavesOfType('markdown')) mountLeaf(leaf, ctx)
  ctx.checklistComponents.releaseDisconnected()
}

export function unmountAll(app: App): void {
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    if (leaf.view instanceof MarkdownView) clear(leaf.view)
  }
}

export const isMobile = (): boolean => Platform.isMobile
