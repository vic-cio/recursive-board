/**
 * The "Assign to…" picker, with each person note and the generic agent request. Each choice adds
 * one holder, so a card can have several (docs/adr/0083-assign-and-several-holders.md). A name
 * that holds the card already is marked and not offered again.
 */
import { FuzzySuggestModal, type App, type FuzzyMatch } from 'obsidian'

import type { Actions } from '../actions.ts'
import type { WorkItemMeta } from '../index.ts'
import { ANY_AGENT, holds } from '../../shared/holder.ts'

type AssignChoice = { kind: 'person'; name: string } | { kind: 'agent' }

export class AssignModal extends FuzzySuggestModal<AssignChoice> {
  private readonly meta: WorkItemMeta
  private readonly actions: Actions
  private readonly choices: AssignChoice[]

  constructor(app: App, actions: Actions, meta: WorkItemMeta, people: string[]) {
    super(app)
    this.meta = meta
    this.actions = actions
    const all: AssignChoice[] = [...people.map((name): AssignChoice => ({ kind: 'person', name })), { kind: 'agent' }]
    this.choices = all.filter((choice) => !holds(meta.holders, holderOf(choice)))
    this.setPlaceholder(`Assign ${meta.title} to…`)
  }

  getItems(): AssignChoice[] {
    return this.choices
  }

  getItemText(choice: AssignChoice): string {
    return choice.kind === 'agent' ? 'An agent' : choice.name
  }

  override renderSuggestion(match: FuzzyMatch<AssignChoice>, el: HTMLElement): void {
    el.createDiv({ text: this.getItemText(match.item) })
  }

  onChooseItem(choice: AssignChoice): void {
    void this.actions.assign(this.meta, holderOf(choice))
  }
}

function holderOf(choice: AssignChoice): string {
  return choice.kind === 'agent' ? ANY_AGENT : choice.name
}
