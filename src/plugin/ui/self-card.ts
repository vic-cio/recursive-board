/**
 * An area shows itself as a card inside its own board
 * (docs/adr/0074-an-area-shows-itself-in-its-own-board.md).
 *
 * Render only. Nothing reaches Markdown, so `wi`, agents and `wi validate` never see it, and
 * parents stay acyclic. The self-card adds nothing to a column count, carries no menu, and cannot
 * be dragged: it is a reflection, not a task. A click expands its preview like any card; its title
 * then plays a short zoom into the card that lands on the same board.
 */
import type { Status } from '../../shared/schema.ts'
import type { WorkItemMeta } from '../index.ts'
import { showingArchived } from './archive-note.ts'
import { renderExpansion } from './card.ts'
import type { RenderContext } from './context.ts'
import { selfCardColumn, selfCardKey, zoomStart } from './self-card-place.ts'

const ZOOM_MS = 360

/** Draws the board's own self-card into the stack of the column it belongs in, if any. */
export function renderSelfCard(stack: HTMLElement, ctx: RenderContext, board: WorkItemMeta, status: Status): void {
  if (selfCardColumn(board, showingArchived(ctx, board)) !== status) return

  const key = selfCardKey(board.file.path)
  const expanded = ctx.expandedPath === key
  const card = stack.createDiv({ cls: `wi-card wi-self-card is-${status}` })
  card.toggleClass('is-expanded', expanded)
  card.toggleClass('is-archived', board.effectiveArchived)

  const face = card.createDiv({ cls: 'wi-card-face' })
  const head = face.createDiv({ cls: 'wi-card-head' })
  head.createSpan({ cls: 'wi-area-mark', text: 'Area', attr: { 'aria-label': 'Area' } })
  const title = head.createDiv({ cls: 'wi-card-title', text: board.title })

  if (expanded) {
    title.addClass('is-link')
    title.setAttr('role', 'link')
    title.setAttr('aria-label', `Open ${board.title}`)
    title.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.metaKey || event.ctrlKey) void ctx.actions.open(board, true)
      else zoomIn(card, ctx)
    })
  }

  face.addEventListener('click', (event) => {
    event.preventDefault()
    if (event.metaKey || event.ctrlKey) {
      void ctx.actions.open(board, true)
      return
    }
    ctx.expand(expanded ? null : key)
  })

  if (expanded) void renderExpansion(card.createDiv({ cls: 'wi-card-body' }), ctx, board)
}

/**
 * Opening the self-card opens the board you are on. The board collapses the card, then grows out
 * of the card's place to its full size, so the open reads as a zoom into a picture of itself.
 * The body zooms, not the takeover layer, because the layer covers the note's editor.
 */
function zoomIn(card: HTMLElement, ctx: RenderContext): void {
  const layer = card.closest<HTMLElement>('.wi-takeover')
  const from = card.getBoundingClientRect()
  ctx.expand(null) // Redraws into the same layer at once, so the new body is there to animate.
  const body = layer?.querySelector<HTMLElement>(':scope > .wi-takeover-body')
  if (!body || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const { x, y, scale } = zoomStart(from, body.getBoundingClientRect())
  body.animate(
    [
      { transformOrigin: '0 0', transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity: 0.3 },
      { transformOrigin: '0 0', transform: 'none', opacity: 1 },
    ],
    { duration: ZOOM_MS, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
  )
}
