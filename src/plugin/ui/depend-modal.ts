/**
 * The "Waits on…" picker: a fuzzy search over the cards and the people this one may wait on
 * (docs/adr/0041-card-dependencies.md, docs/adr/0082-review-is-a-wait-on-a-person.md). A card
 * that would close a loop is left out, so everything offered works, as in the Move to picker.
 * A wait on a person is how a card asks for a review. The person removes the wait to send the
 * card back, or moves the card to done to approve it.
 */
import { FuzzySuggestModal, type App, type FuzzyMatch } from 'obsidian'

import type { Actions } from '../actions.ts'
import type { WorkItemIndex, WorkItemMeta } from '../index.ts'
import { isYou, waitChoices } from '../identity.ts'

type DependChoice =
  | { kind: 'card'; meta: WorkItemMeta }
  | { kind: 'person'; name: string }

export class DependModal extends FuzzySuggestModal<DependChoice> {
  private readonly meta: WorkItemMeta
  private readonly index: WorkItemIndex
  private readonly actions: Actions
  private readonly people: string[]
  private readonly you: string

  constructor(app: App, index: WorkItemIndex, actions: Actions, meta: WorkItemMeta, people: string[], you: string) {
    super(app)
    this.meta = meta
    this.index = index
    this.actions = actions
    this.people = people
    this.you = you
    this.setPlaceholder(`${meta.title} waits on…`)
  }

  getItems(): DependChoice[] {
    const waiting = this.index.personWaits(this.meta).map((wait) => wait.name)
    const cards = this.index
      .all()
      .filter((target) => !target.effectiveArchived && target.status !== 'done' && !target.area)
      .filter((target) => !this.meta.dependsOn.includes(target.file))
      .filter((target) => this.actions.dependencyRefusal(this.meta, target) === null)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((target): DependChoice => ({ kind: 'card', meta: target }))
    // You come first (docs/adr/0085-people-live-in-the-plugin-data.md).
    const people = waitChoices(this.people, this.you, waiting)
      .map((name): DependChoice => ({ kind: 'person', name }))
    return [...people, ...cards]
  }

  getItemText(choice: DependChoice): string {
    return choice.kind === 'card' ? choice.meta.title : choice.name
  }

  override renderSuggestion(match: FuzzyMatch<DependChoice>, el: HTMLElement): void {
    const choice = match.item
    if (choice.kind === 'person') {
      el.createDiv({ text: choice.name })
      el.createEl('small', { cls: 'wi-move-path', text: isYou(choice.name, this.you) ? 'You · a review' : 'Person · a review' })
      return
    }
    el.createDiv({ text: choice.meta.title })
    const path = this.index.ancestorsOf(choice.meta.file).map((a) => a.title).join(' › ')
    if (path !== '') el.createEl('small', { cls: 'wi-move-path', text: path })
  }

  onChooseItem(choice: DependChoice): void {
    if (choice.kind === 'person') void this.actions.setPersonWait(this.meta, choice.name, true)
    else void this.actions.setDependency(this.meta, choice.meta, true)
  }
}
