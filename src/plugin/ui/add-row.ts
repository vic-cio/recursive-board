/**
 * The add row (decision u7).
 *
 * Typing a title and pressing enter is one action, where any dialog is at least four, and that
 * difference decides whether half-formed items get written down at all. The file opens only if
 * you ask.
 *
 * **Where it appears resolves a contradiction between u6 and u7.** u7 puts the row "at the foot
 * of every column"; u6 says a phone never renders columns. Read together they leave the phone
 * unable to create a work item at all, which cannot be right for the device that exists to
 * capture. So the row belongs to a status *group*, whatever shape that group takes: a column on
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
    attr: { placeholder: `Add to ${status}`, 'aria-label': `add a work item to ${status}` },
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
    // New items inherit owner and agent from the parent, so the badges are not blank on
    // exactly the items you create most often.
    void ctx.actions.createChild(parent, title, status)
  })
}

/** Decision q10: a rolling window, so the count is shown rather than the items. */
export function renderHiddenNote(host: HTMLElement, hidden: number): void {
  host.createDiv({ cls: 'wi-hidden-count', text: `+${hidden} done more than 14 days ago` })
}
