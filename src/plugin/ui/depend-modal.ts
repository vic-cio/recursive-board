/**
 * The "Waits on…" picker: a fuzzy search over the cards this one may wait on
 * (docs/adr/0041-card-dependencies.md). A card that would close a loop is left out, so everything
 * offered works, as in the Move to picker.
 */
import { FuzzySuggestModal, type App, type FuzzyMatch } from 'obsidian'

import type { Actions } from '../actions.ts'
import type { WorkItemIndex, WorkItemMeta } from '../index.ts'

export class DependModal extends FuzzySuggestModal<WorkItemMeta> {
  private readonly meta: WorkItemMeta
  private readonly index: WorkItemIndex
  private readonly actions: Actions

  constructor(app: App, index: WorkItemIndex, actions: Actions, meta: WorkItemMeta) {
    super(app)
    this.meta = meta
    this.index = index
    this.actions = actions
    this.setPlaceholder(`${meta.title} waits on…`)
  }

  getItems(): WorkItemMeta[] {
    return this.index
      .all()
      .filter((target) => !target.effectiveArchived && target.status !== 'done' && !target.area)
      .filter((target) => !this.meta.dependsOn.includes(target.file))
      .filter((target) => this.actions.dependencyRefusal(this.meta, target) === null)
      .sort((a, b) => a.title.localeCompare(b.title))
  }

  getItemText(target: WorkItemMeta): string {
    return target.title
  }

  override renderSuggestion(match: FuzzyMatch<WorkItemMeta>, el: HTMLElement): void {
    el.createDiv({ text: match.item.title })
    const path = this.index.ancestorsOf(match.item.file).map((a) => a.title).join(' › ')
    if (path !== '') el.createEl('small', { cls: 'wi-move-path', text: path })
  }

  onChooseItem(target: WorkItemMeta): void {
    void this.actions.setDependency(this.meta, target, true)
  }
}
