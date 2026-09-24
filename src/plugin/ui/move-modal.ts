/**
 * The "Move to…" picker: a fuzzy search over every work item this one may move under.
 *
 * A target that would make the parent chain loop is left out rather than refused after the
 * choice, so everything offered works. Boards and areas come first, because a board is where a card is
 * usually moved to; any work item can still be a parent.
 */
import { FuzzySuggestModal, type App, type FuzzyMatch } from 'obsidian'

import type { Actions } from '../actions.ts'
import { opensAsBoard, type WorkItemIndex, type WorkItemMeta } from '../index.ts'
import { compareMoveTargets } from './move-order.ts'

export class MoveModal extends FuzzySuggestModal<WorkItemMeta> {
  private readonly meta: WorkItemMeta
  private readonly index: WorkItemIndex
  private readonly actions: Actions

  constructor(app: App, index: WorkItemIndex, actions: Actions, meta: WorkItemMeta) {
    super(app)
    this.meta = meta
    this.index = index
    this.actions = actions
    this.setPlaceholder(`Move ${meta.title} to…`)
  }

  getItems(): WorkItemMeta[] {
    return this.index
      .all()
      .filter((target) => target.file.path !== this.meta.parent?.path)
      .filter((target) => this.actions.moveRefusal(this.meta, target) === null)
      .sort(compareMoveTargets)
  }

  getItemText(target: WorkItemMeta): string {
    return target.title
  }

  override renderSuggestion(match: FuzzyMatch<WorkItemMeta>, el: HTMLElement): void {
    const target = match.item
    el.createDiv({ text: opensAsBoard(target) ? `${target.title}  ▦` : target.title })
    const path = this.index.ancestorsOf(target.file).map((a) => a.title).join(' › ')
    if (path !== '') el.createEl('small', { cls: 'wi-move-path', text: path })
  }

  onChooseItem(target: WorkItemMeta): void {
    void this.actions.move(this.meta, target)
  }
}
