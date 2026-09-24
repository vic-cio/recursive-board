/** The required status choice when an area returns to being a card. */
import { FuzzySuggestModal, type App } from 'obsidian'

import { STATUSES, type Status } from '../../shared/schema.ts'
import type { Actions } from '../actions.ts'
import type { WorkItemMeta } from '../index.ts'
import { statusLabel } from './status-label.ts'

export class AreaStatusModal extends FuzzySuggestModal<Status> {
  private readonly actions: Actions
  private readonly meta: WorkItemMeta

  constructor(app: App, actions: Actions, meta: WorkItemMeta) {
    super(app)
    this.actions = actions
    this.meta = meta
    this.setPlaceholder(`Make ${meta.title} a card in…`)
  }

  getItems(): Status[] {
    return [...STATUSES]
  }

  getItemText(status: Status): string {
    return statusLabel(status)
  }

  onChooseItem(status: Status): void {
    void this.actions.convertArea(this.meta, { kind: 'card', status })
  }
}
