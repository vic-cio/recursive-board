/**
 * The "Assign to…" picker, with each person and the generic agent request. Each choice adds
 * one assignee, so a card can have several (docs/adr/0083-assign-and-several-holders.md). A name
 * that is assigned to the card already is not offered again. When this device has "Your name",
 * "Assign to me" comes first (docs/adr/0085-people-live-in-the-plugin-data.md).
 */
import { FuzzySuggestModal, type App, type FuzzyMatch } from 'obsidian'

import type { Actions } from '../actions.ts'
import type { WorkItemMeta } from '../index.ts'
import { assignChoices, assigneeOfChoice, type AssignChoice } from '../identity.ts'

export class AssignModal extends FuzzySuggestModal<AssignChoice> {
  private readonly meta: WorkItemMeta
  private readonly actions: Actions
  private readonly choices: AssignChoice[]

  constructor(app: App, actions: Actions, meta: WorkItemMeta, people: string[], you: string) {
    super(app)
    this.meta = meta
    this.actions = actions
    this.choices = assignChoices(people, you, meta.assignees)
    this.setPlaceholder(`Assign ${meta.title} to…`)
  }

  getItems(): AssignChoice[] {
    return this.choices
  }

  getItemText(choice: AssignChoice): string {
    if (choice.kind === 'agent') return 'An agent'
    // The name stays in the search text, so typing it finds "Assign to me" too.
    return choice.kind === 'me' ? `Assign to me ${choice.name}` : choice.name
  }

  override renderSuggestion(match: FuzzyMatch<AssignChoice>, el: HTMLElement): void {
    const choice = match.item
    if (choice.kind === 'me') {
      el.createDiv({ text: 'Assign to me' })
      el.createEl('small', { cls: 'wi-move-path', text: choice.name })
      return
    }
    el.createDiv({ text: this.getItemText(choice) })
  }

  onChooseItem(choice: AssignChoice): void {
    void this.actions.assign(this.meta, assigneeOfChoice(choice))
  }
}
