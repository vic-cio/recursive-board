/**
 * The dashboard: one page over every board, opened from the ribbon like the graph view
 * (docs/adr/0040-dashboard-view.md). It shows what waits for your review, progress per area, and
 * what each agent works on. It writes no work item. Its own state lives in the plugin's data.
 */
import { ItemView, Notice, Platform, setIcon, TFile, type WorkspaceLeaf } from 'obsidian'

import type { WorkItemIndex, WorkItemMeta } from '../index.ts'
import {
  ago, agentGroups, areaOf, cardsInScope, parseReviewLine, NO_AREA, progress, waitsForReview,
  type Claim, type DashTree, type Group,
} from '../dashboard-model.ts'

export const DASHBOARD_VIEW = 'recursive-board-dashboard'

export interface DashboardState {
  /** The owner name that marks a card as yours to review. Empty until set in settings. */
  you: string
  /** The root board's path, or '' for every root. */
  root: string
  /** The focused area's path, '' for the cards in no area, or null for none. */
  focus: string | null
  /** Review rows you ticked, by file path. */
  ticks: Record<string, boolean>
}

export interface DashboardHost {
  index: WorkItemIndex
  state(): DashboardState
  save(patch: Partial<DashboardState>): Promise<void>
}

const TYPES: Readonly<Record<string, string>> = { pdf: 'PDF', xlsx: 'Spreadsheet', csv: 'Spreadsheet', docx: 'Document', md: 'Note' }
const CLAIM_ICONS = { working: 'loader', idle: 'pause-circle', finished: 'check-circle-2' } as const
const STEP_ICONS: Readonly<Record<string, string>> = { done: 'check-circle-2', doing: 'loader' }

interface ReviewRow {
  card: WorkItemMeta
  path: string
  what: string
  group: Group<WorkItemMeta>
}

export class DashboardView extends ItemView {
  private readonly host: DashboardHost
  private pending: number | null = null

  constructor(leaf: WorkspaceLeaf, host: DashboardHost) {
    super(leaf)
    this.host = host
  }

  override getViewType(): string { return DASHBOARD_VIEW }
  override getDisplayText(): string { return 'Dashboard' }
  override getIcon(): string { return 'layout-dashboard' }

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
    const state = this.host.state()
    const tree = this.tree()
    const all = this.host.index.all()
    const roots = all.filter((item) => item.parentLink === null && !item.area)
      .sort((a, b) => a.title.localeCompare(b.title))
    const root = roots.find((item) => item.file.path === state.root) ?? null
    const cards = cardsInScope(all, root, tree)
    const reviews = await this.reviews(cards, state.you, tree)

    const el = this.contentEl
    el.empty()
    el.addClass('wi-dash')
    this.drawHead(el, roots, root)

    const lower = el.createDiv('wi-dash-lower')
    this.drawReviews(lower.createDiv('wi-dash-panel'), reviews, state)
    const side = lower.createDiv('wi-dash-panel')
    this.drawProgress(side, cards, tree, state)
    this.drawAgents(side, cards, tree, state)
  }

  private drawHead(el: HTMLElement, roots: WorkItemMeta[], root: WorkItemMeta | null): void {
    const head = el.createDiv('wi-dash-head')
    head.createEl('h1', { text: root?.title ?? 'Dashboard' })
    const right = head.createDiv('wi-dash-head-right')
    right.createSpan({
      cls: 'wi-dash-muted',
      text: new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    })
    if (roots.length > 1 || root === null) {
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

  private async reviews(cards: WorkItemMeta[], you: string, tree: DashTree<WorkItemMeta>): Promise<ReviewRow[]> {
    const rows: ReviewRow[] = []
    for (const card of cards) {
      if (!waitsForReview(card, you, tree)) continue
      const line = parseReviewLine(await this.app.vault.cachedRead(card.file))
      const area = areaOf(card, tree)
      const group = { area, name: area?.title ?? NO_AREA }
      const what = line?.what || 'Open the card.'
      const paths = line?.paths.length ? line.paths : [card.file.path]
      for (const path of paths) rows.push({ card, path, what, group })
    }
    return rows.sort((a, b) =>
      Number(a.group.area === null) - Number(b.group.area === null) || a.group.name.localeCompare(b.group.name))
  }

  private drawReviews(panel: HTMLElement, rows: ReviewRow[], state: DashboardState): void {
    this.panelHead(panel, 'file-check', 'For review', String(rows.length))
    if (state.you.trim() === '') {
      panel.createDiv({ cls: 'wi-dash-muted', text: 'Set your name in the Recursive Board settings. A card waits for your review when you own it, it is in doing, and it has no open child.' })
      return
    }
    panel.createDiv({ cls: 'wi-dash-muted', text: 'Files that wait for your review. Click a name to open it.' })
    const table = panel.createEl('table', { cls: 'wi-dash-table' })
    const header = table.createEl('thead').createEl('tr')
    for (const title of ['', 'Name', 'Type', 'Card', 'Check', 'Changed']) header.createEl('th', { text: title })
    const body = table.createEl('tbody')
    if (rows.length === 0) {
      body.createEl('tr').createEl('td', { text: 'Nothing waits for your review.', attr: { colspan: 6 } })
      return
    }

    const groupRows = new Map<string, HTMLElement[]>()
    rows.forEach((row, i) => {
      const key = groupKey(row.group)
      const previous = rows[i - 1]
      if (!previous || groupKey(previous.group) !== key) {
        const shown = isOpen(state, row.group)
        const heading = body.createEl('tr', { cls: 'wi-dash-group' })
        const cell = heading.createEl('td', { attr: { colspan: 6 } })
        const caret = cell.createSpan('wi-dash-caret')
        setIcon(caret, shown ? 'chevron-down' : 'chevron-right')
        cell.createSpan({ cls: 'wi-dash-group-name', text: row.group.name })
        cell.createSpan({ cls: 'wi-dash-count', text: String(rows.filter((other) => groupKey(other.group) === key).length) })
        groupRows.set(key, [])
        heading.onclick = () => {
          const members = groupRows.get(key) ?? []
          const hide = !members[0]?.hasClass('wi-dash-hidden')
          members.forEach((member) => member.toggleClass('wi-dash-hidden', hide))
          setIcon(caret, hide ? 'chevron-right' : 'chevron-down')
        }
      }

      const tr = body.createEl('tr')
      groupRows.get(key)?.push(tr)
      if (!isOpen(state, row.group)) tr.addClass('wi-dash-hidden')
      const tick = tr.createEl('td').createEl('input', { type: 'checkbox', attr: { 'aria-label': 'Reviewed' } })
      tick.checked = state.ticks[row.path] === true
      tr.toggleClass('is-ticked', tick.checked)
      tick.onchange = async () => {
        tr.toggleClass('is-ticked', tick.checked)
        const ticks = { ...this.host.state().ticks }
        if (tick.checked) ticks[row.path] = true
        else delete ticks[row.path]
        await this.host.save({ ticks })
      }

      const name = row.path.split('/').pop() ?? row.path
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'md'
      const nameCell = tr.createEl('td').createSpan('wi-dash-name')
      setIcon(nameCell.createSpan('wi-dash-icon'), ext === 'md' ? 'file-text' : ext === 'pdf' ? 'file' : 'file-spreadsheet')
      this.link(nameCell, name, () => this.openPath(row.path))
      tr.createEl('td', { cls: 'wi-dash-muted', text: TYPES[ext] ?? ext.toUpperCase() })

      if (!previous || previous.card !== row.card) {
        let span = 1
        while (rows[i + span]?.card === row.card) span++
        this.link(tr.createEl('td', { attr: { rowspan: span } }), row.card.title, () => this.openFile(row.card.file))
        tr.createEl('td', { cls: 'wi-dash-muted wi-dash-check', text: row.what, attr: { rowspan: span } })
      }
      const file = this.app.vault.getAbstractFileByPath(row.path)
      tr.createEl('td', {
        cls: 'wi-dash-muted wi-dash-nowrap',
        text: file instanceof TFile ? new Date(file.stat.mtime).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '',
      })
    })
  }

  private drawProgress(panel: HTMLElement, cards: WorkItemMeta[], tree: DashTree<WorkItemMeta>, state: DashboardState): void {
    const rows = progress(cards, tree)
    const done = rows.reduce((sum, row) => sum + row.done, 0)
    const total = rows.reduce((sum, row) => sum + row.total, 0)
    this.panelHead(panel, 'bar-chart-3', 'Progress')
    panel.createDiv({ cls: 'wi-dash-muted', text: `${done} of ${total} cards done` })
    const list = panel.createDiv('wi-dash-projects')
    for (const row of rows) {
      const pct = row.total ? Math.round((100 * row.done) / row.total) : 0
      const focused = state.focus === groupKey(row)
      const item = list.createDiv({ cls: `wi-dash-project${focused ? ' is-focused' : ''}` })
      item.onclick = async (event) => {
        if ((event.target as HTMLElement).closest('a')) return
        await this.host.save({ focus: focused ? null : groupKey(row) })
        await this.render()
      }
      const head = item.createDiv('wi-dash-project-head')
      const area = row.area
      if (area) this.link(head, row.name, () => this.openFile(area.file)).addClass('wi-dash-project-name')
      else head.createSpan({ cls: 'wi-dash-project-name', text: row.name })
      head.createSpan({ cls: 'wi-dash-muted', text: `${row.done}/${row.total} done${row.doing ? `, ${row.doing} doing` : ''} · ${pct}%` })
      item.createDiv('wi-dash-bar').createDiv({ cls: 'wi-dash-bar-fill', attr: { style: `width: ${pct}%` } })
    }
    panel.createDiv({
      cls: 'wi-dash-muted wi-dash-hint',
      text: state.focus !== null ? 'Click the focused area again to open every area.' : 'Click an area to focus the review table and the agents on it.',
    })
  }

  private drawAgents(panel: HTMLElement, cards: WorkItemMeta[], tree: DashTree<WorkItemMeta>, state: DashboardState): void {
    const groups = agentGroups(cards, state.you, tree, Date.now())
    const working = groups.reduce((sum, group) => sum + group.working.length, 0)
    const idle = groups.reduce((sum, group) => sum + group.idle.length, 0)
    const head = this.panelHead(panel, 'bot', 'Agents', `${working} working`)
    head.addClass('wi-dash-agents-head')
    if (idle) head.createSpan({ cls: 'wi-dash-count is-idle', text: `${idle} idle` })
    if (groups.length === 0) {
      panel.createDiv({ cls: 'wi-dash-muted', text: 'No agent has claimed a card yet.' })
      return
    }
    for (const group of groups) {
      const box = panel.createEl('details', { cls: 'wi-dash-agent-group' })
      box.open = isOpen(state, group)
      const summary = box.createEl('summary')
      summary.createSpan({ cls: 'wi-dash-group-name', text: group.name })
      summary.createSpan({ cls: 'wi-dash-count', text: `${group.working.length} working` })
      if (group.idle.length) summary.createSpan({ cls: 'wi-dash-count is-idle', text: `${group.idle.length} idle` })
      this.claims(box, 'Working now', group.working, 'working')
      if (group.idle.length) {
        this.claims(box, 'Idle claims', group.idle, 'idle',
          'In doing with an agent, but no change for an hour. Release or close them on the board.')
      }
      this.claims(box, 'Recently finished', group.finished, 'finished')
    }
  }

  private claims(host: HTMLElement, label: string, list: Claim<WorkItemMeta>[], kind: keyof typeof CLAIM_ICONS, hint?: string): void {
    host.createDiv({ cls: 'wi-dash-muted wi-dash-label', text: label })
    if (hint) host.createDiv({ cls: 'wi-dash-muted wi-dash-hint', text: hint })
    if (list.length === 0) {
      host.createDiv({ cls: 'wi-dash-muted', text: 'None.' })
      return
    }
    const box = host.createDiv('wi-dash-agents')
    for (const { card, steps, active } of list) {
      const row = box.createDiv({ cls: `wi-dash-agent is-${kind}` })
      setIcon(row.createSpan('wi-dash-icon'), CLAIM_ICONS[kind])
      const body = row.createDiv('wi-dash-agent-body')
      this.link(body, card.title, () => this.openFile(card.file))
      const parent = card.parent ? this.host.index.get(card.parent)?.title : undefined
      body.createDiv({ cls: 'wi-dash-muted', text: [card.agent, parent].filter(Boolean).join(' · ') })
      if (kind !== 'finished' && steps.length > 0) {
        const done = steps.filter((step) => step.status === 'done').length
        body.createDiv({ cls: 'wi-dash-muted', text: `${done}/${steps.length} steps done` })
        if (kind === 'working') {
          const list = body.createDiv('wi-dash-steps')
          for (const step of steps) {
            const item = list.createDiv({ cls: `wi-dash-step is-${step.status ?? 'backlog'}` })
            setIcon(item.createSpan('wi-dash-icon'), STEP_ICONS[step.status ?? ''] ?? 'circle')
            this.link(item, step.title, () => this.openFile(step.file))
          }
        }
      }
      row.createSpan({ cls: 'wi-dash-ago', text: ago(active, Date.now()), attr: { 'data-mtime': String(active) } })
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

  private async openFile(file: TFile): Promise<void> {
    await this.app.workspace.getLeaf(false).openFile(file)
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

function isOpen(state: DashboardState, group: Group<WorkItemMeta>): boolean {
  return state.focus === null || state.focus === groupKey(group)
}

export function parseDashboardState(value: unknown): DashboardState {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const ticks: Record<string, boolean> = {}
  if (typeof record['ticks'] === 'object' && record['ticks'] !== null) {
    for (const [path, ticked] of Object.entries(record['ticks'])) if (ticked === true) ticks[path] = true
  }
  return {
    you: typeof record['you'] === 'string' ? record['you'] : '',
    root: typeof record['root'] === 'string' ? record['root'] : '',
    focus: typeof record['focus'] === 'string' ? record['focus'] : null,
    ticks,
  }
}
