/**
 * The "Tags…" picker: the card's free tags, checked, then every other free tag on a work item, and
 * the typed text as a new tag (docs/adr/free-tags.md). Choosing a row adds or removes one tag
 * through the same shared rule as `wi tag`, so an area tag is refused here too.
 */
import { Notice, SuggestModal, type App } from 'obsidian'

import type { Actions } from '../actions.ts'
import type { WorkItemIndex, WorkItemMeta } from '../index.ts'
import { tagSuggestions, type TagSuggestion } from './tag-suggestions.ts'

export class TagModal extends SuggestModal<TagSuggestion> {
  private readonly meta: WorkItemMeta
  private readonly actions: Actions
  private readonly inUse: string[]

  constructor(app: App, index: WorkItemIndex, actions: Actions, meta: WorkItemMeta) {
    super(app)
    this.meta = meta
    this.actions = actions
    this.inUse = index.all().flatMap((item) => item.labels)
    this.setPlaceholder(`Tag ${meta.title}, or type a new tag`)
    this.emptyStateText = 'No free tags yet. Type one to add it.'
  }

  getSuggestions(query: string): TagSuggestion[] {
    return tagSuggestions(this.meta.labels, this.inUse, query)
  }

  renderSuggestion(row: TagSuggestion, el: HTMLElement): void {
    el.addClass('wi-tag-suggestion')
    if (row.kind === 'tag') {
      el.createSpan({ cls: 'wi-tag-check', text: row.on ? '✓' : '' })
      el.createSpan({ text: `#${row.tag}` })
    } else if (row.kind === 'new') {
      el.createSpan({ cls: 'wi-tag-check', text: '+' })
      el.createSpan({ text: `New tag #${row.tag}` })
    } else {
      el.addClass('wi-tag-refused')
      el.createDiv({ text: row.text })
      el.createEl('small', { text: row.reason })
    }
  }

  onChooseSuggestion(row: TagSuggestion): void {
    if (row.kind === 'refused') {
      new Notice(row.reason)
      return
    }
    void this.actions.setTag(this.meta, row.tag, row.kind === 'new' || !row.on)
  }
}
