/**
 * The dashboard: one page over every board, opened from the ribbon like the graph view
 * (docs/adr/0040-dashboard-view.md). It shows what waits for your review, progress per area, and
 * one feed of what the agents work on. Its one write is a review verdict, through `Actions.review`
 * (docs/adr/0043-review-verdicts.md). Device choices and person ticks have separate storage.
 */
import { ItemView, Notice, Platform, setIcon, TFile, type WorkspaceLeaf } from 'obsidian'

import type { Actions } from '../actions.ts'
import type { WorkItemIndex, WorkItemMeta } from '../index.ts'
import type { Verdict } from '../../shared/review.ts'
import { SendBackModal } from './send-back-modal.ts'
import {
  ago, agentFeed, allReviewFilesTicked, areaPath, cardsInScope, fileReviewPaths, groupName, groupUnder, inFocus, isLoopbackWebAddress, isWebAddress, needsAttention, parseReviewLine, progress, reviewPathsForMode, waitsForReview, workingBadge,
  type AgentFeed, type AgentRow, type Attention, type DashTree, type Group, type WebReviewMode,
} from '../dashboard-model.ts'
import { withFold, type DashboardTicks } from '../personal-state.ts'

export const DASHBOARD_VIEW = 'recursive-board-dashboard'
/** Not `layout-dashboard`: Obsidian's new-canvas button already uses it. */
export const DASHBOARD_ICON = 'gauge'

export interface DashboardState {
  /** The owner name that marks a card as yours to review. Empty until set in settings. */
  you: string
  /** The root board's path, or '' for every root. */
  root: string
  /** The focused area's path, or null to show the top areas. */
  focus: string | null
  /** Review rows you ticked, by file path. */
  ticks: DashboardTicks
  /** How web addresses in review notes are shown and opened. */
  webReviewMode: WebReviewMode
  /** The finished fold under the Agents feed is open. */
  finishedOpen: boolean
  /** The For review groups folded on this device, by group key. */
  foldedGroups: string[]
}

export interface DashboardHost {
  index: WorkItemIndex
  actions: Actions
  state(): DashboardState
  save(patch: Partial<DashboardState>): Promise<void>
  personNames(): string[]
  reloadTicks(): Promise<DashboardTicks>
}

const TYPES: Readonly<Record<string, string>> = { pdf: 'PDF', xlsx: 'Spreadsheet', csv: 'Spreadsheet', docx: 'Document', md: 'Note' }
const CLAIM_ICONS = { working: 'loader', finished: 'check-circle-2' } as const
const ATTENTION_ICONS = { started: 'hourglass', archived: 'archive', quiet: 'pause-circle' } as const

interface ReviewRow {
  card: WorkItemMeta
  path: string
  what: string
  group: Group<WorkItemMeta>
}

export class DashboardView extends ItemView {
  private readonly host: DashboardHost
  private pending: number | null = null
  /** Counts renders. A render reads files before it draws, so an older one can finish after a newer one. */
  private generation = 0

  constructor(leaf: WorkspaceLeaf, host: DashboardHost) {
    super(leaf)
    this.host = host
  }

  override getViewType(): string { return DASHBOARD_VIEW }
  override getDisplayText(): string { return 'Dashboard' }
  override getIcon(): string { return DASHBOARD_ICON }

  override async onOpen(): Promise<void> {
    // Keep the "12 min" labels current without a redraw.
    this.registerInterval(window.setInterval(() => {
      this.contentEl.querySelectorAll<HTMLElement>('.wi-dash-ago[data-mtime]').forEach((el) => {
        el.textContent = ago(Number(el.dataset['mtime']), Date.now())
      })
    }, 60_000))
    await this.render()
  }

  override async onClose(): Promise<void> {
    if (this.pending !== null) window.clearTimeout(this.pending)
  }

  /** Coalesces a burst of vault changes. Typing in a card fires one per keystroke. */
  refresh(): void {
    if (this.pending !== null) window.clearTimeout(this.pending)
    this.pending = window.setTimeout(() => {
      this.pending = null
      void this.render()
    }, 400)
  }

  private tree(): DashTree<WorkItemMeta> {
    const { index } = this.host
    return {
      childrenOf: (item) => index.childrenOf(item.file),
      ancestorsOf: (item) => index.ancestorsOf(item.file),
      mtimeOf: (item) => item.file.stat.mtime,
    }
  }

  async render(): Promise<void> {
    const generation = ++this.generation
    await this.host.reloadTicks()
    const state = this.host.state()
    const tree = this.tree()
    const all = this.host.index.all()
    const roots = all.filter((item) => item.parentLink === null && !item.area)
      .sort((a, b) => a.title.localeCompare(b.title))
    const root = roots.find((item) => item.file.path === state.root) ?? null
    const cards = cardsInScope(all, root, tree)
    const focus = all.find((item) => item.area && item.file.path === state.focus) ?? null
    const reviews = await this.reviews(cards, state.you, state.webReviewMode, tree, focus)
    if (generation !== this.generation) return

    const el = this.contentEl
    el.empty()
    el.addClass('wi-dash')
    this.drawHead(el, roots, root)
    this.drawTrail(el, focus, tree)

    const lower = el.createDiv('wi-dash-lower')
    const main = lower.createDiv('wi-dash-column')
    // The feed, the working badges and the quiet claims in Needs attention all come from this one list.
    const feed = agentFeed(cards, state.you, tree, Date.now(), focus)
    const attention = needsAttention(cards.filter((card) => inFocus(card, focus, tree)),
      (card) => card.dependsOn.map((file) => this.host.index.get(file)).filter((found): found is WorkItemMeta => found !== null),
      feed.idle.map((row) => row.card))
    if (attention.length > 0) this.drawAttention(main.createDiv('wi-dash-panel'), attention)
    this.drawReviews(main.createDiv('wi-dash-panel'), reviews, state)
    const side = lower.createDiv('wi-dash-panel')
    this.drawProgress(side, cards, tree, focus, feed)
    this.drawAgents(side, feed, state)
  }

  private async setFocus(focus: WorkItemMeta | null): Promise<void> {
    await this.host.save({ focus: focus?.file.path ?? null })
    await this.render()
  }

  /** Every area, then each area down to the focus. A crumb goes back up to that level. */
  private drawTrail(el: HTMLElement, focus: WorkItemMeta | null, tree: DashTree<WorkItemMeta>): void {
    const trail = el.createDiv('wi-dash-trail')
    const levels = focus ? [null, ...areaPath(focus, tree), focus] : [null]
    levels.forEach((level, i) => {
      if (i > 0) setIcon(trail.createSpan('wi-dash-icon'), 'chevron-right')
      const name = level?.title ?? 'Every area'
      if (i === levels.length - 1) trail.createSpan({ cls: 'wi-dash-trail-here', text: name })
      else this.link(trail, name, () => this.setFocus(level))
    })
  }

  private drawHead(el: HTMLElement, roots: WorkItemMeta[], root: WorkItemMeta | null): void {
    const head = el.createDiv('wi-dash-head')
    head.createEl('h1', { text: root?.title ?? 'Dashboard' })
    const right = head.createDiv('wi-dash-head-right')
    right.createSpan({
      cls: 'wi-dash-muted',
      text: new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    })
    // With one root, "Every root" and that root show the same cards, so the picker has no choice to offer.
    if (roots.length > 1) {
      const select = right.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Root board' } })
      select.createEl('option', { text: 'Every root', value: '' })
      for (const item of roots) select.createEl('option', { text: item.title, value: item.file.path })
      select.value = root?.file.path ?? ''
      select.onchange = async () => {
        await this.host.save({ root: select.value, focus: null })
        await this.render()
      }
    }
    if (root) {
      const open = right.createEl('button', { text: 'Open board' })
      open.onclick = () => void this.openFile(root.file)
    }
  }

  private async reviews(
    cards: WorkItemMeta[], you: string, webReviewMode: WebReviewMode, tree: DashTree<WorkItemMeta>, focus: WorkItemMeta | null,
  ): Promise<ReviewRow[]> {
    const rows: ReviewRow[] = []
    for (const card of cards) {
      if (!inFocus(card, focus, tree) || !waitsForReview(card, you, tree)) continue
      const line = parseReviewLine(await this.app.vault.cachedRead(card.file))
      const area = groupUnder(card, focus, tree)
      const group = { area, name: groupName(area, focus) }
      const what = line?.what || 'Open the card.'
      const paths = reviewPathsForMode(line?.paths ?? [], card.file.path, webReviewMode)
      for (const path of paths) rows.push({ card, path, what, group })
    }
    return rows.sort((a, b) =>
      Number(a.group.area === null) - Number(b.group.area === null) || a.group.name.localeCompare(b.group.name))
  }

  /** Dependency problems (docs/adr/0041-card-dependencies.md). Drawn only when there is one. */
  private drawAttention(panel: HTMLElement, list: Attention<WorkItemMeta>[]): void {
    this.panelHead(panel, 'alert-triangle', 'Needs attention', String(list.length)).addClass('is-attention')
    const box = panel.createDiv('wi-dash-agents')
    for (const { card, reason, cards } of list) {
      const row = box.createDiv({ cls: `wi-dash-agent is-${reason}` })
      setIcon(row.createSpan('wi-dash-icon'), ATTENTION_ICONS[reason])
      const body = row.createDiv('wi-dash-agent-body')
      this.link(body, card.title, () => this.openFile(card.file))
      const line = body.createDiv({ cls: 'wi-dash-muted' })
      if (reason === 'quiet') {
        line.setText(`Agent went quiet: ${card.agent ?? 'an agent'} changed nothing for an hour. Release or close the card.`)
        this.copyId(row, card)
        continue
      }
      line.createSpan({ text: reason === 'started' ? 'In doing, but still waits on ' : 'Waits on archived ' })
      cards.forEach((other, i) => {
        if (i > 0) line.createSpan({ text: ', ' })
        this.link(line, other.title, () => this.openFile(other.file))
      })
    }
  }

  private drawReviews(panel: HTMLElement, rows: ReviewRow[], state: DashboardState): void {
    this.panelHead(panel, 'file-check', 'For review', String(rows.length))
    if (state.you.trim() === '') {
      panel.createDiv({ cls: 'wi-dash-muted', text: 'Choose your person note or enter your name. The dashboard lists cards in doing that you own and that have no open child.' })
      this.namePicker(panel)
      return
    }
    panel.createDiv({
      cls: 'wi-dash-muted',
      text: 'Files that wait for your review. Click a name to open it, and tick each file when you have looked. ' +
        'When every file of a card is ticked, approve the card or send it back. Web pages have no tick.',
    })
    const table = panel.createEl('table', { cls: 'wi-dash-table' })
    const header = table.createEl('thead').createEl('tr')
    for (const title of ['', 'Name', 'Type', 'Card', 'Check', 'Changed']) header.createEl('th', { text: title })
    const body = table.createEl('tbody')
    if (rows.length === 0) {
      body.createEl('tr').createEl('td', { text: 'Nothing waits for your review.', attr: { colspan: 6 } })
      return
    }

    const groupRows = new Map<string, HTMLElement[]>()
    // Approve and Send back show once every file of the card is ticked.
    const verdicts = new Map<WorkItemMeta, HTMLElement[]>()
    const pathsOf = (card: WorkItemMeta) => rows.filter((row) => row.card === card).map((row) => row.path)
    const filePathsOf = (card: WorkItemMeta) => fileReviewPaths(pathsOf(card))
    const syncVerdict = (card: WorkItemMeta) => {
      const ticks = this.host.state().ticks
      verdicts.get(card)?.forEach((verdict) =>
        verdict.toggleClass('wi-dash-hidden', !allReviewFilesTicked(pathsOf(card), ticks)))
    }
    const addVerdictControls = (check: HTMLElement, card: WorkItemMeta) => {
      if (filePathsOf(card).length === 0) return
      const box = check.createDiv('wi-dash-verdict wi-dash-hidden')
      box.createEl('button', { text: 'Approve', cls: 'mod-cta' }).onclick = () =>
        void this.verdict(card, { verdict: 'approve', you: this.host.state().you }, filePathsOf(card))
      box.createEl('button', { text: 'Send back' }).onclick = () =>
        new SendBackModal(this.app, card.title, (comment) =>
          void this.verdict(card, { verdict: 'send back', you: this.host.state().you, comment }, filePathsOf(card))).open()
      verdicts.set(card, [...(verdicts.get(card) ?? []), box])
      syncVerdict(card)
    }
    rows.forEach((row, i) => {
      const key = groupKey(row.group)
      const previous = rows[i - 1]
      if (!previous || groupKey(previous.group) !== key) {
        const heading = body.createEl('tr', { cls: 'wi-dash-group' })
        const cell = heading.createEl('td', { attr: { colspan: 6 } })
        const caret = cell.createSpan('wi-dash-caret')
        setIcon(caret, state.foldedGroups.includes(key) ? 'chevron-right' : 'chevron-down')
        cell.createSpan({ cls: 'wi-dash-group-name', text: row.group.name })
        cell.createSpan({ cls: 'wi-dash-count', text: String(rows.filter((other) => groupKey(other.group) === key).length) })
        groupRows.set(key, [])
        // Saved, not redrawn: the dashboard redraws on every vault change and must keep each fold as it is.
        heading.onclick = () => {
          const fold = !this.host.state().foldedGroups.includes(key)
          groupRows.get(key)?.forEach((member) => member.toggleClass('wi-dash-hidden', fold))
          setIcon(caret, fold ? 'chevron-right' : 'chevron-down')
          void this.host.save({ foldedGroups: withFold(this.host.state().foldedGroups, key, fold) })
        }
      }

      const tr = body.createEl('tr', { cls: 'wi-dash-review-row' })
      tr.toggleClass('wi-dash-hidden', state.foldedGroups.includes(key))
      groupRows.get(key)?.push(tr)
      const web = isWebAddress(row.path)
      const tickCell = tr.createEl('td', { cls: 'wi-dash-review-tick' })
      tickCell.dataset['label'] = 'Reviewed'
      if (!web) {
        const tick = tickCell.createEl('input', { type: 'checkbox', attr: { 'aria-label': 'Reviewed' } })
        tick.checked = state.ticks[row.path] === true
        tr.toggleClass('is-ticked', tick.checked)
        tick.onchange = async () => {
          tr.toggleClass('is-ticked', tick.checked)
          const ticks = { ...this.host.state().ticks }
          if (tick.checked) ticks[row.path] = true
          else delete ticks[row.path]
          await this.host.save({ ticks })
          syncVerdict(row.card)
        }
      }

      const name = web ? row.path.replace(/^https?:\/\//, '').replace(/\/$/, '') : row.path.split('/').pop() ?? row.path
      const ext = web ? '' : name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'md'
      const nameCell = tr.createEl('td', { cls: 'wi-dash-review-target' }).createSpan('wi-dash-name')
      nameCell.parentElement?.setAttribute('data-label', 'Target')
      setIcon(nameCell.createSpan('wi-dash-icon'),
        web ? 'globe-2' : ext === 'md' ? 'file-text' : ext === 'pdf' ? 'file' : 'file-spreadsheet')
      if (web && Platform.isMobileApp && isLoopbackWebAddress(row.path)) {
        nameCell.createSpan({ cls: 'wi-dash-muted', text: 'Open it on the computer that runs it' })
      } else {
        this.link(nameCell, name, () => web ? this.openWeb(row.path, this.host.state().webReviewMode) : this.openPath(row.path))
      }
      tr.createEl('td', {
        cls: 'wi-dash-muted wi-dash-review-type',
        text: web ? 'Web page' : TYPES[ext] ?? ext.toUpperCase(),
        attr: { 'data-label': 'Type' },
      })

      if (!previous || previous.card !== row.card) {
        let span = 1
        while (rows[i + span]?.card === row.card) span++
        const cardCell = tr.createEl('td', {
          cls: 'wi-dash-desktop-card', attr: { rowspan: span, 'data-label': 'Card' },
        })
        this.link(cardCell, row.card.title, () => this.openFile(row.card.file))
        const check = tr.createEl('td', {
          cls: 'wi-dash-muted wi-dash-check wi-dash-desktop-check',
          attr: { rowspan: span, 'data-label': 'Check' },
        })
        check.createDiv({ text: row.what })
        addVerdictControls(check, row.card)
      }
      const phoneCard = tr.createEl('td', {
        cls: 'wi-dash-phone-card', attr: { 'data-label': 'Card' },
      })
      this.link(phoneCard, row.card.title, () => this.openFile(row.card.file))
      const phoneCheck = tr.createEl('td', {
        cls: 'wi-dash-muted wi-dash-check wi-dash-phone-check',
        attr: { 'data-label': 'Check' },
      })
      phoneCheck.createDiv({ text: row.what })
      addVerdictControls(phoneCheck, row.card)
      const file = this.app.vault.getAbstractFileByPath(row.path)
      tr.createEl('td', {
        cls: 'wi-dash-muted wi-dash-nowrap wi-dash-review-date',
        text: file instanceof TFile ? new Date(file.stat.mtime).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '',
        attr: { 'data-label': 'Changed' },
      })
    })
  }

  private namePicker(panel: HTMLElement): void {
    const input = panel.createEl('input', { type: 'text', attr: { placeholder: 'Your name', 'aria-label': 'Your name' } })
    const list = panel.createEl('datalist')
    list.id = `wi-dash-person-names-${Math.random().toString(36).slice(2)}`
    input.setAttribute('list', list.id)
    for (const name of this.host.personNames()) list.createEl('option', { attr: { value: name } })
    input.addEventListener('change', () => {
      void this.host.save({ you: input.value.trim() })
    })
    // A phone shows a datalist only in the keyboard bar, so each person note is also one tap.
    const names = this.host.personNames()
    if (names.length === 0) return
    const buttons = panel.createDiv('wi-dash-names')
    for (const name of names) {
      buttons.createEl('button', { text: name }).onclick = () => void this.host.save({ you: name })
    }
  }

  /** Writes the verdict, then forgets the card's ticks: a card sent back starts its next review clean. */
  private async verdict(card: WorkItemMeta, verdict: Verdict, paths: string[]): Promise<void> {
    if (!(await this.host.actions.review(card, verdict))) return
    const ticks = { ...this.host.state().ticks }
    for (const path of paths) delete ticks[path]
    await this.host.save({ ticks })
    await this.render()
  }

  private drawProgress(
    panel: HTMLElement, cards: WorkItemMeta[], tree: DashTree<WorkItemMeta>, focus: WorkItemMeta | null, feed: AgentFeed<WorkItemMeta>,
  ): void {
    const rows = progress(cards, tree, focus)
    const done = rows.reduce((sum, row) => sum + row.done, 0)
    const total = rows.reduce((sum, row) => sum + row.total, 0)
    const head = this.panelHead(panel, 'bar-chart-3', 'Progress')
    if (focus) {
      // The trail sits at the top of the page; this is the same step up, beside the rows it changes.
      const up = areaPath(focus, tree).at(-1) ?? null
      const back = this.link(head, '', () => this.setFocus(up))
      back.addClass('wi-dash-back')
      setIcon(back.createSpan('wi-dash-icon'), 'arrow-left')
      back.createSpan({ text: up?.title ?? 'Every area' })
    }
    panel.createDiv({ cls: 'wi-dash-muted', text: `${done} of ${total} cards done, backlog not counted` })
    const list = panel.createDiv('wi-dash-projects')
    for (const row of rows) {
      const pct = row.total ? Math.round((100 * row.done) / row.total) : 0
      const area = row.area
      // The whole area row drills in. Only the board icon at its right end opens the board.
      const item = list.createDiv({ cls: `wi-dash-project${area ? ' is-area' : ''}` })
      const main = item.createDiv('wi-dash-project-main')
      const head = main.createDiv('wi-dash-project-head')
      const name = head.createSpan({ cls: 'wi-dash-project-name', text: row.name })
      const working = workingBadge(feed, area)
      if (working > 0) {
        const badge = name.createSpan({ cls: 'wi-dash-badge', attr: { 'aria-label': `${working} working` } })
        setIcon(badge.createSpan('wi-dash-icon'), 'loader')
        badge.createSpan({ text: String(working) })
      }
      head.createSpan({ cls: 'wi-dash-muted', text: `${row.done}/${row.total} done${row.doing ? `, ${row.doing} doing` : ''} · ${pct}%${row.backlog ? ` · ${row.backlog} in backlog` : ''}` })
      main.createDiv('wi-dash-bar').createDiv({ cls: 'wi-dash-bar-fill', attr: { style: `width: ${pct}%` } })
      if (area) {
        item.onclick = () => void this.setFocus(area)
        const open = item.createEl('button', {
          cls: 'clickable-icon wi-dash-project-open', attr: { 'aria-label': `Open the ${area.title} board` },
        })
        setIcon(open, 'square-kanban')
        open.onclick = (event) => {
          event.stopPropagation()
          void this.openFile(area.file)
        }
      } else {
        // Holds the board icon's width, so every bar ends at the same place.
        item.createSpan({ cls: 'wi-dash-project-open wi-dash-project-spacer', attr: { 'aria-hidden': 'true' } })
      }
    }
  }

  /** One flat feed, newest first. The finished claims wait behind one fold. */
  private drawAgents(panel: HTMLElement, feed: AgentFeed<WorkItemMeta>, state: DashboardState): void {
    this.panelHead(panel, 'bot', 'Agents', `${feed.working.length} working`).addClass('wi-dash-agents-head')
    if (feed.working.length === 0) panel.createDiv({ cls: 'wi-dash-muted wi-dash-empty', text: 'No agent is working.' })
    else this.agentRows(panel.createDiv('wi-dash-agents'), feed.working, 'working')
    if (feed.finished.length === 0) return

    const fold = panel.createDiv('wi-dash-fold')
    const toggle = fold.createEl('button', { cls: 'wi-dash-fold-toggle', attr: { 'aria-expanded': String(state.finishedOpen) } })
    toggle.createSpan({ text: `${feed.finished.length} finished in the last 24 h` })
    const caret = toggle.createSpan('wi-dash-icon')
    const rows = fold.createDiv('wi-dash-agents')
    this.agentRows(rows, feed.finished, 'finished')
    const show = (open: boolean) => {
      rows.toggleClass('wi-dash-hidden', !open)
      toggle.setAttribute('aria-expanded', String(open))
      setIcon(caret, open ? 'chevron-down' : 'chevron-right')
    }
    show(state.finishedOpen)
    // Saved, not redrawn: the dashboard redraws on every vault change and must keep the fold as it is.
    toggle.onclick = () => {
      const open = !this.host.state().finishedOpen
      show(open)
      void this.host.save({ finishedOpen: open })
    }
  }

  /** Line one: status, card, age. Line two: agent, the area under the focus, and steps done. */
  private agentRows(box: HTMLElement, list: AgentRow<WorkItemMeta>[], kind: keyof typeof CLAIM_ICONS): void {
    for (const { card, steps, active, area } of list) {
      const row = box.createDiv({ cls: `wi-dash-agent is-${kind}` })
      setIcon(row.createSpan('wi-dash-icon'), CLAIM_ICONS[kind])
      const body = row.createDiv('wi-dash-agent-body')
      this.link(body, card.title, () => this.openFile(card.file))
      const line = body.createDiv('wi-dash-muted wi-dash-agent-meta')
      line.createSpan({ text: card.agent ?? '' })
      if (area) line.createSpan({ cls: 'wi-dash-chip', text: area.title })
      if (steps.length > 0) {
        line.createSpan({ text: `${steps.filter((step) => step.status === 'done').length}/${steps.length} steps` })
      }
      row.createSpan({ cls: 'wi-dash-ago', text: ago(active, Date.now()), attr: { 'data-mtime': String(active) } })
      this.copyId(row, card)
    }
  }

  /**
   * A copy icon that puts the card id on the clipboard, so a person can paste the card to an agent.
   * A card with no id gets no control; wi validate reports it.
   */
  private copyId(host: HTMLElement, card: WorkItemMeta): void {
    const id = card.id
    if (!id) return
    const button = host.createEl('button', { cls: 'clickable-icon wi-dash-copy', attr: { 'aria-label': `Copy ${id}` } })
    setIcon(button, 'copy')
    button.onclick = async (event) => {
      event.stopPropagation()
      await navigator.clipboard.writeText(id)
      new Notice(`Copied ${id}`)
    }
  }

  private panelHead(panel: HTMLElement, icon: string, title: string, count?: string): HTMLElement {
    const head = panel.createDiv('wi-dash-panel-head')
    setIcon(head.createSpan('wi-dash-icon'), icon)
    head.createSpan({ cls: 'wi-dash-title', text: title })
    if (count !== undefined) head.createSpan({ cls: 'wi-dash-count', text: count })
    return head
  }

  private link(host: HTMLElement, text: string, open: () => unknown): HTMLElement {
    const a = host.createEl('a', { text, href: '#' })
    a.onclick = (event) => {
      event.preventDefault()
      void open()
    }
    return a
  }

  /** Phones reuse this tab. A desktop keeps the dashboard behind the opened file. */
  private async openFile(file: TFile): Promise<void> {
    const leaf = Platform.isMobileApp ? this.leaf : this.app.workspace.getLeaf('tab')
    await leaf.openFile(file)
  }

  /**
   * A web address opens in a Web viewer tab when that core plugin is on.
   * Otherwise, and on a phone, it opens in the browser.
   */
  private async openWeb(url: string, mode: WebReviewMode): Promise<void> {
    if (mode === 'browser') {
      this.openInBrowser(url)
      return
    }
    // Obsidian's own registry, missing from its type definitions.
    const plugins = (this.app as unknown as { internalPlugins?: { getEnabledPluginById?: (id: string) => unknown } }).internalPlugins
    if (mode === 'webviewer' && Platform.isDesktopApp && plugins?.getEnabledPluginById?.('webviewer')) {
      await this.app.workspace.getLeaf('tab').setViewState({ type: 'webviewer', state: { url, navigate: true }, active: true })
    } else this.openInBrowser(url)
  }

  /**
   * The system browser. On a desktop, `window.open` goes to a Web viewer tab when that core
   * plugin opens external links, so it uses Electron's shell, which Obsidian exposes as a global.
   * A global needs no import, so the bundle still loads on iOS (see ios-safety.test.ts).
   */
  private openInBrowser(url: string): void {
    const shell = (window as unknown as { electron?: { shell?: { openExternal?: (url: string) => Promise<void> } } }).electron?.shell
    if (Platform.isDesktopApp && shell?.openExternal) void shell.openExternal(url)
    else window.open(url)
  }

  /** Markdown opens in Obsidian. Other files open in their own app on a desktop, and in Obsidian on a phone. */
  private async openPath(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) {
      new Notice(`Missing: ${path}`)
      return
    }
    // Obsidian's own call, missing from its type definitions.
    const external = (this.app as unknown as { openWithDefaultApp?: (path: string) => void }).openWithDefaultApp
    if (file.extension !== 'md' && Platform.isDesktopApp && external) external.call(this.app, path)
    else await this.openFile(file)
  }
}

function groupKey(group: Group<WorkItemMeta>): string {
  return group.area?.file.path ?? ''
}
