/** The "Delegate to…" picker, with each person note and the generic agent request. */
import { FuzzySuggestModal, type App, type FuzzyMatch } from 'obsidian'

import type { Actions } from '../actions.ts'
import type { WorkItemMeta } from '../index.ts'

type DelegateChoice = { kind: 'person'; name: string } | { kind: 'agent' }

export class DelegateModal extends FuzzySuggestModal<DelegateChoice> {
  private readonly meta: WorkItemMeta
  private readonly actions: Actions
  private readonly choices: DelegateChoice[]

  constructor(app: App, actions: Actions, meta: WorkItemMeta, people: string[]) {
    super(app)
    this.meta = meta
    this.actions = actions
    this.choices = [...people.map((name): DelegateChoice => ({ kind: 'person', name })), { kind: 'agent' }]
    this.setPlaceholder(`Delegate ${meta.title} to…`)
  }

  getItems(): DelegateChoice[] {
    return this.choices
  }

  getItemText(choice: DelegateChoice): string {
    return choice.kind === 'agent' ? 'An agent' : choice.name
  }

  override renderSuggestion(match: FuzzyMatch<DelegateChoice>, el: HTMLElement): void {
    el.createDiv({ text: this.getItemText(match.item) })
  }

  onChooseItem(choice: DelegateChoice): void {
    const holder = choice.kind === 'agent' ? 'agent' : choice.name
    void this.actions.delegate(this.meta, holder)
  }
}
