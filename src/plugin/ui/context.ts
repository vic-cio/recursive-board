/** What every render function needs. Passed down rather than reached for, so rendering stays pure. */
import type { App, Component } from 'obsidian'

import type { Actions } from '../actions.ts'
import type { WorkItemIndex } from '../index.ts'
import type { Status } from '../../shared/schema.ts'
import type { ChecklistComponents } from './checklist.ts'

export interface RenderContext {
  app: App
  /** The plugin. Owns what the Markdown renderer registers, so it is released on unload. */
  component: Component
  index: WorkItemIndex
  actions: Actions
  /** The people a card can wait on or be assigned to: the people list and each person note. */
  personNames(): string[]
  /** "Your name": the person this device is, or an empty string (docs/adr/0085-people-live-in-the-plugin-data.md). */
  yourName(): string
  checklistComponents: ChecklistComponents
  /** True on a phone or tablet. A board uses status tabs there (docs/adr/0022-phone-board-navigation.md). */
  mobile: boolean
  /** The path of the one expanded card, or null. Only one expands at a time (docs/adr/0016-cards-expand-in-place.md). */
  expandedPath: string | null
  /** Expands a card, collapsing whichever was open. */
  expand(path: string | null): void
  /**
   * True when this item's text is being read instead of its board.
   * Session state, never written: a view preference is reconstructable from nothing, so it has no
   * business in the canonical layer.
   */
  isPeeking(path: string): boolean
  setPeek(path: string, peeking: boolean): void
  selectedTab(path: string): Status | undefined
  selectTab(path: string, status: Status): void
  /** True when the raw Properties panel shows on this work item (docs/adr/0042-creator-and-role.md). */
  isShowingProperties(path: string): boolean
  toggleProperties(path: string): void
  isShowingArchived(path: string): boolean
  toggleArchived(path: string): void
}
