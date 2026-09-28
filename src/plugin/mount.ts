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
 * embedded backlinks, exactly this way. The Objective remains before the checklist; a short
 * summary at the top points to it without changing the note's reading order.
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
import { opensAsBoard, type WorkItemMeta } from './index.ts'

const TOP = 'wi-region-top'
const META = 'wi-region-meta'
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

/**
 * The meta strip goes under the note's title and its Properties panel, above the body: the facts
 * about a card are read before its text. Editing mode keeps the title and panel as children of the
 * sizer, reading mode inside `.mod-header`.
 */
function metaRegion(sizer: HTMLElement): HTMLElement {
  const existing = sizer.querySelector<HTMLElement>(`:scope > .${META}`)
  if (existing) {
    existing.empty()
    return existing
  }
  const el = createDiv({ cls: `${REGION} ${META}` })
  const header = [...sizer.querySelectorAll<HTMLElement>(`:scope > :is(.mod-header, .inline-title, .metadata-container, .${TOP})`)].pop()
  if (header) header.after(el)
  else sizer.prepend(el)
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

const PROPERTIES_HIDDEN = 'wi-properties-hidden'

/** Obsidian's "Show inline title" setting, on unless turned off. Not in the typed API. */
function showsInlineTitle(ctx: RenderContext): boolean {
  const vault = ctx.app.vault as unknown as { getConfig?: (key: string) => unknown }
  return vault.getConfig?.('showInlineTitle') !== false
}

/**
 * The editor pads its content by half a screen so a note can scroll past its end. The strip sits
 * after the content, so a short note put that whole gap above it. Pull the strip up into the
 * padding and give the same room back below it. The padding is an inline style CodeMirror sets,
 * so it is read at each draw rather than overridden in CSS.
 */
function closeScrollGap(sizer: HTMLElement, bottom: HTMLElement): void {
  const content = sizer.querySelector<HTMLElement>('.cm-content')
  const pad = content ? Number.parseFloat(getComputedStyle(content).paddingBottom) || 0 : 0
  bottom.style.marginTop = pad > 0 ? `${24 - pad}px` : ''
  bottom.style.paddingBottom = pad > 0 ? `${pad}px` : ''
}

function clear(view: MarkdownView): void {
  view.contentEl.removeClass(PROPERTIES_HIDDEN)
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
  // The meta strip says what the raw Properties panel says, so a work item hides the panel until
  // its Properties button shows it (docs/adr/0042-creator-and-role.md). Other notes keep it.
  view.contentEl.toggleClass(PROPERTIES_HIDDEN, meta !== null && !ctx.isShowingProperties(file.path))
  if (!meta) {
    clear(view)
    return
  }

  // Promoted items and areas are boards first on both devices. Areas are boards by definition,
  // without carrying the separate `board: true` marker.
  const takesOver = opensAsBoard(meta) && !ctx.isPeeking(file.path)

  if (takesOver) {
    clearSizers(view)
    const layer = takeoverLayer(view)
    clearFloatingHeader(view, layer)
    renderBreadcrumbs(layer, ctx, meta)
    const body = layer.createDiv({ cls: 'wi-takeover-body' })
    renderMetaStrip(body, meta, ctx)
    renderBoard(body, ctx, meta, ctx.index.childrenOf(meta.file))
    return
  }

  clearTakeover(view)
  view.contentEl.addClass(REGION_HOST)
  for (const sizer of sizersOf(view)) {
    // The facts sit under the title; the checklist sits below the body, which is what you came to read.
    const bottom = region(sizer, BOTTOM, false)
    renderBreadcrumbs(region(sizer, TOP, true), ctx, meta, bottom, !showsInlineTitle(ctx))
    closeScrollGap(sizer, bottom)
    renderMetaStrip(metaRegion(sizer), meta, ctx)
    renderChecklist(bottom, ctx, ctx.index.childrenOf(meta.file), {
      grouped: opensAsBoard(meta),
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
