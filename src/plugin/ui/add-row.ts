/**
 * The add row (docs/adr/0017-inline-status-capture.md).
 *
 * Typing a title and pressing enter is one action, where any dialog is at least four, and that
 * difference decides whether half-formed items get written down at all. The file opens only if
 * you ask.
 *
 * On desktop, each column has an add row. On phones, status tabs replace columns. The row
 * belongs to a status *group*, whatever shape that group takes: a column on
 * the desktop board, a heading on the mobile board, and a single backlog row on a plain
 * checklist.
 */
import type { Status } from '../../shared/schema.ts'
import type { WorkItemMeta } from '../index.ts'
import type { RenderContext } from './context.ts'

export function renderAddRow(
  host: HTMLElement,
  ctx: RenderContext,
  parent: WorkItemMeta,
  status: Status,
): void {
  const row = host.createDiv({ cls: 'wi-add-row' })
  const input = row.createEl('input', {
    type: 'text',
    cls: 'wi-add-input',
    attr: { placeholder: `Add to ${status}`, 'aria-label': `Add a work item to ${status}` },
  })

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      input.value = ''
      input.blur()
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    const title = input.value
    input.value = ''
    // New items inherit the parent's owner; agent inheritance follows the shared status rule.
    void ctx.actions.createChild(parent, title, status)
  })
}

/** Older done items remain stored, but the board shows their count outside its rolling window. */
export function renderHiddenNote(host: HTMLElement, hidden: number): void {
  host.createDiv({ cls: 'wi-hidden-count', text: `+${hidden} done more than 14 days ago` })
}
