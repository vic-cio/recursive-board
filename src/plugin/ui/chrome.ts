/**
 * Breadcrumbs, the metadata strip and the promote toggle.
 *
 * Decision D8 made `Boards/` one flat folder, which makes the file explorer useless as
 * navigation. the maintainer, looking at nineteen files in one list: "will have to navigate through links
 * and the graph view". Breadcrumbs are the consequence, and decision u8 puts them at the top of
 * every work item rather than only on boards, because the prototype review found they are the
 * primary way back.
 *
 * Ordering follows the prototype review: the Objective is what you came to read, so the metadata
 * strip and the board sit below the note body.
 *
 * The promote control does not. The review put it below the Objective with everything else, but
 * that leaves a checklist with its only route back to a board at the foot of the note, past the
 * whole body. the maintainer, on the first real use: "when i switch to checklist instead of board the
 * option to view board at the top disappears". U1 said "a toggle in the note header" all along,
 * and the doc's own open threads record that the toggle was never specified. It lives in the top
 * bar.
 */
import { setIcon } from 'obsidian'

import type { WorkItemMeta } from '../index.ts'
import type { RenderContext } from './context.ts'

/** The chain from the root down to this item, always visible at the top. */
export function renderBreadcrumbs(
  host: HTMLElement,
  ctx: RenderContext,
  meta: WorkItemMeta,
): void {
  const bar = host.createDiv({ cls: 'wi-breadcrumbs' })
  const trail = bar.createDiv({ cls: 'wi-crumb-trail' })
  const ancestors = ctx.index.ancestorsOf(meta.file)

  if (meta.parentLink !== null && meta.parent === null) {
    // The orphan case. The item is not lost; it is simply on no board (decision u8).
    const warn = trail.createSpan({ cls: 'wi-crumb is-orphan' })
    setIcon(warn.createSpan({ cls: 'wi-crumb-icon' }), 'unlink')
    warn.createSpan({ text: `parent [[${meta.parentLink}]] not found` })
    trail.createSpan({ cls: 'wi-crumb-sep', text: '/' })
  }

  for (const ancestor of ancestors) {
    const crumb = trail.createSpan({ cls: 'wi-crumb', text: ancestor.title })
    crumb.addEventListener('click', (event) => {
      event.preventDefault()
      void ctx.actions.open(ancestor, event.metaKey || event.ctrlKey)
    })
    trail.createSpan({ cls: 'wi-crumb-sep', text: '/' })
  }
  trail.createSpan({ cls: 'wi-crumb is-current', text: meta.title })

  renderControls(bar, ctx, meta)
}

/**
 * The two controls, which do different kinds of thing and so are never merged.
 *
 * Promote and demote change what the item *is*, and that is written to the file (decision U3).
 * Notes and Board change what this pane is showing, and that is session state which is never
 * written: a per-view preference is reconstructable from nothing, which is the hole the first
 * grill found in storing one.
 *
 * They are labelled with the words the design docs use, rather than both saying "Board", because
 * a button that reads the same as its neighbour but does something durable is a trap.
 */
function renderControls(bar: HTMLElement, ctx: RenderContext, meta: WorkItemMeta): void {
  const childCount = ctx.index.childCount(meta.file)
  if (childCount === 0 && !meta.board) return

  const group = bar.createDiv({ cls: 'wi-controls' })
  if (meta.board) renderViewSwitch(group, ctx, meta)
  renderPromoteToggle(group, ctx, meta)
}

/** Showing the text of a promoted board instead of its columns. Session only. */
function renderViewSwitch(group: HTMLElement, ctx: RenderContext, meta: WorkItemMeta): void {
  const peeking = ctx.isPeeking(meta.file.path)
  const button = group.createEl('button', { cls: 'wi-control wi-peek' })
  setIcon(button.createSpan({ cls: 'wi-control-icon' }), peeking ? 'columns-3' : 'file-text')
  button.createSpan({ text: peeking ? 'Board' : 'Notes' })
  button.setAttr('aria-label', peeking ? 'show the board' : 'show the note text')
  button.addEventListener('click', () => ctx.setPeek(meta.file.path, !peeking))
}

/**
 * The promote toggle (decisions U1 and U3).
 *
 * It writes `board: true`, so the choice survives a reindex, syncs to the phone and is visible in
 * plain Markdown. Demoting deletes the key: absence means not a board.
 */
function renderPromoteToggle(group: HTMLElement, ctx: RenderContext, meta: WorkItemMeta): void {
  const button = group.createEl('button', { cls: 'wi-control wi-toggle' })
  button.toggleClass('is-on', meta.board)
  setIcon(button.createSpan({ cls: 'wi-control-icon' }), meta.board ? 'list' : 'columns-3')
  button.createSpan({ text: meta.board ? 'Demote' : 'Promote' })
  button.setAttr(
    'aria-label',
    meta.board ? 'demote to a checklist' : 'promote to a board',
  )
  button.setAttr(
    'title',
    meta.board
      ? 'Demote to a checklist. Removes board from the frontmatter.'
      : 'Promote to a board. Writes board: true to the frontmatter.',
  )
  button.addEventListener('click', () => void ctx.actions.setPromoted(meta, !meta.board))
}

/** Status, priority, owner, agent and id. A strip of facts, not a form. */
export function renderMetaStrip(host: HTMLElement, meta: WorkItemMeta): void {
  const strip = host.createDiv({ cls: 'wi-meta' })

  if (meta.status !== undefined) {
    strip.createSpan({ cls: `wi-pill is-${meta.status}`, text: meta.status })
  } else if (meta.parentLink === null) {
    strip.createSpan({ cls: 'wi-pill is-root', text: 'root' })
  }
  if (meta.blocked) strip.createSpan({ cls: 'wi-pill is-blocked', text: 'blocked' })
  if (meta.priority !== undefined) strip.createSpan({ cls: 'wi-pill', text: `P${meta.priority}` })
  if (meta.owner !== undefined) strip.createSpan({ cls: 'wi-pill', text: meta.owner })
  if (meta.agent !== undefined) strip.createSpan({ cls: 'wi-pill is-agent', text: meta.agent })
  if (meta.updated !== undefined) {
    strip.createSpan({ cls: 'wi-pill is-quiet', text: `updated ${meta.updated}` })
  }
  if (meta.id !== undefined) strip.createSpan({ cls: 'wi-pill is-quiet', text: meta.id })
}
