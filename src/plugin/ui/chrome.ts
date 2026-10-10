/**
 * Breadcrumbs, the metadata strip and the promote toggle.
 *
 * The flat work-item folder (docs/adr/0003-flat-configurable-work-item-folder.md) makes the file explorer useless as
 * navigation. Breadcrumbs are the consequence, and they sit at the top of every work
 * item rather than only on boards, because the prototype review found they are the primary way
 * back.
 *
 * The metadata strip sits under the note's title, because it stands in for the Properties panel
 * there (docs/adr/0042-creator-and-role.md). The checklist and the board sit below the note body.
 *
 * The checklist shortcut and the promote control sit side by side in the top bar. The checklist itself remains below
 * the note body, where the prototype review placed it.
 */
import { Notice, setIcon, type TFile } from 'obsidian'

import { holderLabel } from '../../shared/holder.ts'
import { opensAsBoard, type WorkItemMeta } from '../index.ts'
import type { RenderContext } from './context.ts'
import { shouldRenderPromoteToggle } from './promote-visibility.ts'
import { statusLabel } from './status-label.ts'

/** The chain from the root down to this item, always visible at the top. */
export function renderBreadcrumbs(
  host: HTMLElement,
  ctx: RenderContext,
  meta: WorkItemMeta,
  checklist?: HTMLElement,
  /** False when the note's own inline title already names the item, so it is not said twice. */
  showCurrent = true,
): void {
  const bar = host.createDiv({ cls: 'wi-breadcrumbs' })
  const trail = bar.createDiv({ cls: 'wi-crumb-trail' })
  const ancestors = ctx.index.ancestorsOf(meta.file)

  if (meta.parentLink !== null && meta.parent === null) {
    // The orphan case. The item is not lost; it is simply on no board.
    const warn = trail.createSpan({ cls: 'wi-crumb is-orphan' })
    setIcon(warn.createSpan({ cls: 'wi-crumb-icon' }), 'unlink')
    warn.createSpan({ text: `Parent [[${meta.parentLink}]] not found` })
    trail.createSpan({ cls: 'wi-crumb-sep', text: '/' })
  }

  ancestors.forEach((ancestor, i) => {
    if (i > 0) trail.createSpan({ cls: 'wi-crumb-sep', text: '/' })
    const crumb = trail.createSpan({ cls: 'wi-crumb', text: ancestor.title })
    crumb.addEventListener('click', (event) => {
      event.preventDefault()
      void ctx.actions.open(ancestor, event.metaKey || event.ctrlKey)
    })
  })
  if (showCurrent) {
    if (ancestors.length > 0) trail.createSpan({ cls: 'wi-crumb-sep', text: '/' })
    trail.createSpan({ cls: 'wi-crumb is-current', text: meta.title })
  }

  renderControls(bar, ctx, meta, checklist)
}

/**
 * The two controls, which do different kinds of thing and so are never merged.
 *
 * Promote and demote change what the item *is*, and that is written to the file (docs/adr/0001-markdown-is-canonical-and-edits-preserve-unknown-keys.md).
 * Notes and Board change what this pane is showing, and that is session state which is never
 * written: a per-view preference is reconstructable from nothing, which was the flaw found in an
 * early design review.
 *
 * They are labelled with the words the design docs use, rather than both saying "Board", because
 * a button that reads the same as its neighbour but does something durable is a trap.
 */
function renderControls(
  bar: HTMLElement,
  ctx: RenderContext,
  meta: WorkItemMeta,
  checklist: HTMLElement | undefined,
): void {
  const childCount = ctx.index.childCount(meta.file)
  if (!checklist && childCount === 0 && !meta.board && !meta.area && meta.parentLink === null) return

  const group = bar.createDiv({ cls: 'wi-controls' })
  if (checklist) renderChecklistJump(group, checklist, childCount)
  if (opensAsBoard(meta)) renderViewSwitch(group, ctx, meta)
  if (shouldRenderPromoteToggle({ meta, childCount })) renderPromoteToggle(group, ctx, meta)
}

/** A visible shortcut to the checklist at the foot of a long note, beside Promote. */
function renderChecklistJump(host: HTMLElement, target: HTMLElement, childCount: number): void {
  const summary = childCount === 0
    ? 'No children'
    : `${childCount} ${childCount === 1 ? 'child' : 'children'}`
  const button = host.createEl('button', { cls: 'wi-control wi-checklist-jump', text: `${summary} · Add` })
  button.setAttr('aria-label', `Jump to checklist: ${summary}`)
  button.addEventListener('click', () => target.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

/** Showing the text of a promoted board instead of its columns. Session only. */
function renderViewSwitch(group: HTMLElement, ctx: RenderContext, meta: WorkItemMeta): void {
  const peeking = ctx.isPeeking(meta.file.path)
  const button = group.createEl('button', { cls: 'wi-control wi-peek' })
  setIcon(button.createSpan({ cls: 'wi-control-icon' }), peeking ? 'columns-3' : 'file-text')
  button.createSpan({ text: peeking ? 'Board' : 'Notes' })
  button.setAttr('aria-label', peeking ? 'Show the board' : 'Show the note text')
  button.addEventListener('click', () => ctx.setPeek(meta.file.path, !peeking))
}

/**
 * The promote toggle (docs/adr/0015-checklist-and-board-navigation.md).
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
    meta.board ? 'Demote to a checklist' : 'Promote to a board',
  )
  button.setAttr(
    'title',
    meta.board
      ? 'Demote to a checklist. Removes board from the frontmatter.'
      : 'Promote to a board. Writes board: true to the frontmatter.',
  )
  button.addEventListener('click', () => void ctx.actions.setPromoted(meta, !meta.board))
}

/**
 * The facts of a work item, in words, and the actions on them. It stands in for the raw Properties
 * panel, which a work item hides until the Properties button shows it (docs/adr/0042-creator-and-role.md).
 * A person or dependency opens its note, and the id copies itself.
 */
export function renderMetaStrip(host: HTMLElement, meta: WorkItemMeta, ctx?: RenderContext): void {
  const strip = host.createDiv({ cls: 'wi-meta' })
  const openFile = (file: TFile) => void ctx?.app.workspace.getLeaf(false).openFile(file)

  if (meta.status !== undefined) {
    strip.createSpan({ cls: `wi-pill is-${meta.status}`, text: statusLabel(meta.status) })
  } else if (meta.parentLink === null) {
    strip.createSpan({ cls: 'wi-pill is-root', text: 'Root' })
  }
  const waits = [
    ...(ctx?.index.openDependencies(meta) ?? []).map((dependency) => ({ title: dependency.title, file: dependency.file })),
    ...(ctx?.index.personWaits(meta) ?? []).map((file) => ({ title: file.basename, file })),
  ]
  if (waits.length > 0) {
    const pill = strip.createSpan({ cls: 'wi-pill is-waiting' })
    pill.createSpan({ text: 'Waits on ' })
    waits.forEach((wait, i) => {
      if (i > 0) pill.createSpan({ text: ', ' })
      linkTo(pill, wait.title, () => openFile(wait.file))
    })
  }
  if (meta.priority !== undefined) strip.createSpan({ cls: 'wi-pill', text: `P${meta.priority}` })
  if (meta.owner !== undefined) {
    const pill = strip.createSpan({ cls: 'wi-pill', attr: { 'aria-label': 'Owner' } })
    namePill(pill, meta.owner, meta.ownerFile, openFile)
  }
  if (meta.holder !== undefined) {
    strip.createSpan({ cls: 'wi-pill is-agent', text: holderLabel(meta.holder), attr: { 'aria-label': 'Holder' } })
  }
  if (meta.creator !== undefined) {
    const pill = strip.createSpan({ cls: 'wi-pill is-quiet' })
    pill.createSpan({ text: 'By ' })
    namePill(pill, meta.creator, meta.creatorFile, openFile)
    if (meta.creatorModel !== undefined) pill.createSpan({ text: ` · ${meta.creatorModel}` })
  }
  if (meta.updated !== undefined) {
    strip.createSpan({ cls: 'wi-pill is-quiet', text: `Updated ${meta.updated}` })
  }
  if (meta.id !== undefined) {
    const id = meta.id
    const pill = strip.createEl('button', { cls: 'wi-pill is-quiet is-copy', text: id, attr: { 'aria-label': `Copy ${id}` } })
    pill.addEventListener('click', () => void navigator.clipboard.writeText(id)
      .then(() => new Notice(`${id} copied`))
      .catch(() => new Notice(`Could not copy ${id}`)))
  }
  if (ctx) {
    const shown = ctx.isShowingProperties(meta.file.path)
    const toggle = strip.createEl('button', {
      cls: 'wi-pill is-quiet is-properties',
      text: shown ? 'Hide properties' : 'Properties',
      attr: { 'aria-label': shown ? 'Hide the raw properties' : 'Show the raw properties to edit them' },
    })
    toggle.addEventListener('click', () => ctx.toggleProperties(meta.file.path))
  }
}

function linkTo(host: HTMLElement, text: string, open: () => void): void {
  const link = host.createEl('a', { text, href: '#' })
  link.addEventListener('click', (event) => {
    event.preventDefault()
    open()
  })
}

/** A person or role: a link when it has a note, plain text when it has none. */
function namePill(host: HTMLElement, name: string, file: TFile | null, open: (file: TFile) => void): void {
  if (file) linkTo(host, name, () => open(file))
  else host.createSpan({ text: name })
}
