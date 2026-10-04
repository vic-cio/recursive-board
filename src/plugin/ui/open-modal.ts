/**
 * The "Open work item…" picker: find any card by part of its id or its title, and open it.
 *
 * A SuggestModal rather than a FuzzySuggestModal, so the order comes from `matchWorkItems`, which
 * the tests cover: an id match before a title match, and open cards before done ones.
 */
import { SuggestModal, type App } from 'obsidian'

import type { Actions } from '../actions.ts'
import { opensAsBoard, type WorkItemIndex, type WorkItemMeta } from '../index.ts'
import { matchWorkItems } from './open-match.ts'

export class OpenModal extends SuggestModal<WorkItemMeta> {
  private readonly index: WorkItemIndex
  private readonly actions: Actions

  constructor(app: App, index: WorkItemIndex, actions: Actions) {
    super(app)
    this.index = index
    this.actions = actions
    this.setPlaceholder('Type part of an id or a title')
    this.emptyStateText = 'No work item matches.'
  }

  getSuggestions(query: string): WorkItemMeta[] {
    return matchWorkItems(this.index.all(), query)
  }

  renderSuggestion(item: WorkItemMeta, el: HTMLElement): void {
    el.addClass('wi-open-row')
    const title = el.createDiv({ text: opensAsBoard(item) ? `${item.title}  ▦` : item.title })
    if (item.id !== undefined) title.createSpan({ cls: 'wi-open-id', text: item.id })
    const path = this.index.ancestorsOf(item.file).map((a) => a.title).join(' › ')
    if (path !== '') el.createEl('small', { cls: 'wi-move-path', text: path })
  }

  onChooseSuggestion(item: WorkItemMeta): void {
    void this.actions.open(item)
  }
}
