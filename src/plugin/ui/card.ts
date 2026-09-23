/**
 * A card face and its in-place expansion.
 *
 * A collapsed card shows its title and badges, without prose (docs/adr/0016-cards-expand-in-place.md). A badge is honest in a way a
 * summary is not, because a child count of three is always current while a summary goes stale the
 * moment the work changes.
 *
 * docs/adr/0016-cards-expand-in-place.md: a card expands in place to show its Objective, its Acceptance Criteria and its own
 * tickable child checklist. That is what makes bare badges safe on a phone, where hover does not
 * exist, and it is the actual Trello motion: open a card, tick something, close it, still on the
 * board.
 */
import { Notice, Platform, setIcon } from 'obsidian'

import { labelColour, labelText } from '../../shared/labels.ts'
import { bodyOf, listItems, section } from '../../shared/sections.ts'
import type { WorkItemMeta } from '../index.ts'
import type { RenderContext } from './context.ts'
import { renderChecklist } from './checklist.ts'
import { attachMenu, renderMenuButton } from './menu.ts'

/** Draws one card, expanded or not, and returns its element. */
export function renderCard(
  parent: HTMLElement,
  ctx: RenderContext,
  meta: WorkItemMeta,
  options: { draggable: boolean },
): HTMLElement {
  const expanded = ctx.expandedPath === meta.file.path
  const card = parent.createDiv({ cls: 'wi-card' })
  // Status colour reads the same in a column, in a checklist and on the phone, where there are no
  // columns to say it. Blocked overrides it in CSS.
  if (meta.status !== undefined) card.addClass(`is-${meta.status}`)
  card.toggleClass('is-expanded', expanded)
  card.toggleClass('is-blocked', meta.blocked)
  card.toggleClass('is-archived', meta.effectiveArchived)
  card.dataset['path'] = meta.file.path

  const face = card.createDiv({ cls: 'wi-card-face' })
  if (meta.labels.length > 0) renderLabels(face.createDiv({ cls: 'wi-labels' }), meta.labels)

  const head = face.createDiv({ cls: 'wi-card-head' })
  const title = head.createDiv({ cls: 'wi-card-title', text: meta.title })
  renderMenuButton(head, ctx, meta)
  renderRemove(head, ctx, meta)

  renderBadges(face.createDiv({ cls: 'wi-badges' }), ctx, meta)

  // Once a card is open, clicking its title is the way into the item. Collapsed, the whole face
  // expands instead, so the title must not compete with that.
  if (expanded) {
    title.addClass('is-link')
    title.setAttr('role', 'link')
    title.setAttr('aria-label', `Open ${meta.title}`)
    title.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void ctx.actions.open(meta, event.metaKey || event.ctrlKey)
    })
  }

  face.addEventListener('click', (event) => {
    event.preventDefault()
    // Modifier-click goes straight into the item, without expanding first.
    if (event.metaKey || event.ctrlKey) {
      void ctx.actions.open(meta, true)
      return
    }
    ctx.expand(expanded ? null : meta.file.path)
  })

  // HTML5 drag events do not fire on iOS touch, so drag is desktop only.
  if (options.draggable && !Platform.isMobile) {
    card.draggable = true
    card.addEventListener('dragstart', (event) => {
      card.addClass('is-dragging')
      event.dataTransfer?.setData('text/plain', meta.file.path)
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    })
    card.addEventListener('dragend', () => card.removeClass('is-dragging'))
  }

  attachMenu(card, ctx, meta)

  if (expanded) void renderExpansion(card.createDiv({ cls: 'wi-card-body' }), ctx, meta)
  return card
}

/**
 * The remove control, which is the add row's missing inverse.
 *
 * It is quiet until the card is hovered on the desktop, and always drawn on a phone, where there
 * is no hover. Obsidian's own confirmation dialog does the asking.
 */
export function renderRemove(
  host: HTMLElement,
  ctx: RenderContext,
  meta: WorkItemMeta,
): void {
  const button = host.createEl('button', { cls: 'wi-remove' })
  setIcon(button, 'x')
  button.setAttr('aria-label', `Remove ${meta.title}`)
  button.setAttr('title', `Remove ${meta.title}`)
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation() // Never expand or open the card on the way to removing it.
    void ctx.actions.remove(meta)
  })
}

/**
 * Labels, drawn above the title the way Trello draws them.
 *
 * A label is an entry in `tags`, so it needs no new field and it is a real Obsidian tag. The
 * colour comes from the text, so two devices agree without anything being stored or synced.
 */
export function renderLabels(host: HTMLElement, labels: string[]): void {
  for (const label of labels) {
    host.createSpan({
      cls: 'wi-label',
      text: labelText(label),
      attr: { 'data-colour': labelColour(label), 'aria-label': `Label ${label}` },
    })
  }
}

/** Child count, board, priority, blocked marker, owner or agent initial. No other fields appear on the collapsed face. */
function renderBadges(host: HTMLElement, ctx: RenderContext, meta: WorkItemMeta): void {
  const children = ctx.index.childCount(meta.file)
  if (children > 0) {
    const badge = host.createSpan({ cls: 'wi-badge wi-badge-children' })
    setIcon(badge.createSpan({ cls: 'wi-badge-icon' }), 'list')
    badge.createSpan({ text: String(children) })
  }
  if (meta.board) {
    const badge = host.createSpan({ cls: 'wi-badge wi-badge-board', attr: { 'aria-label': 'Board' } })
    setIcon(badge, 'columns-3')
  }
  if (meta.priority !== undefined) {
    host.createSpan({ cls: 'wi-badge wi-badge-priority', text: `P${meta.priority}` })
  }
  if (meta.blocked) {
    const badge = host.createSpan({ cls: 'wi-badge wi-badge-blocked', attr: { 'aria-label': 'Blocked' } })
    setIcon(badge, 'octagon-alert')
  }
  const who = meta.agent ?? meta.owner
  if (who !== undefined) {
    host.createSpan({
      cls: `wi-badge wi-badge-who${meta.agent ? ' is-agent' : ''}`,
      text: who.slice(0, 1).toUpperCase(),
      attr: { 'aria-label': meta.agent ? `Agent ${who}` : `Owner ${who}` },
    })
  }
}

/**
 * The card's code, which is the `id` it already carries.
 *
 * No tenth field and no counter. A per-board sequential code would need both, and two devices
 * offline would each allocate the same next number, which a sync service could resolve by
 * silently keeping one. The id is unique by construction and is already what every command takes,
 * so `wi status <id> doing` works on whatever you copy from here.
 */
function renderCode(host: HTMLElement, id: string): void {
  const code = host.createSpan({ cls: 'wi-code', text: id })
  code.setAttr('title', `${id} — click to copy`)
  code.addEventListener('click', (event) => {
    // A click copies; a drag still selects, so the text is reachable either way.
    if (!window.getSelection()?.isCollapsed) return
    event.preventDefault()
    event.stopPropagation()
    void navigator.clipboard
      .writeText(id)
      .then(() => new Notice(`${id} copied`))
      .catch(() => new Notice(`Could not copy ${id}`))
  })
}

async function renderExpansion(
  host: HTMLElement,
  ctx: RenderContext,
  meta: WorkItemMeta,
): Promise<void> {
  const body = bodyOf(await ctx.app.vault.cachedRead(meta.file))
  if (!host.isConnected) return

  const objective = section(body, 'Objective')
  if (objective) host.createDiv({ cls: 'wi-objective', text: objective })

  const criteria = listItems(body, 'Acceptance Criteria')
  if (criteria.length > 0) {
    const list = host.createEl('ul', { cls: 'wi-criteria' })
    for (const line of criteria) list.createEl('li', { text: line })
  }

  const children = ctx.index.childrenOf(meta.file)
  if (children.length > 0) {
    host.createDiv({ cls: 'wi-card-section', text: 'Children' })
    renderChecklist(host, ctx, children, { grouped: false, parent: undefined, archiveParent: meta })
  }

  // The id lives here rather than on the face (docs/adr/0021-card-and-row-typography.md): it is for
  // agents and `wi` commands, not for reading the board. Copy id is also in the menu.
  if (meta.id !== undefined) renderCode(host.createDiv({ cls: 'wi-card-code' }), meta.id)

  if (!objective && criteria.length === 0 && children.length === 0) {
    host.createDiv({ cls: 'wi-empty', text: 'No objective, criteria or children yet.' })
  }
}
