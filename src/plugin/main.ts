/**
 * Recursive Board.
 *
 * A work item's children render as a checklist, or as four columns once you promote it. The
 * plugin is a view and never the database: everything it shows comes from frontmatter, and
 * everything it writes is one key on one file.
 *
 * The plugin must load on iOS, so nothing in this bundle may import `node`, `fs`,
 * `path`, `child_process` or `electron`. Two guards enforce that: `tsconfig.plugin.json` has no
 * Node types, and `build/forbidden-imports.mjs` fails the build.
 */
import { MarkdownView, Notice, normalizePath, Platform, Plugin, TFile, type Editor } from 'obsidian'
import { parseVaultConfig, parseVaultConfigNote, parseVaultConfigValues, WI_CONFIG_FILE } from '../shared/vault-config.ts'
import { isVaultConfigEvent, parseConfigNote, parseLegacyConfig, VAULT_CONFIG_NOTE, writeConfigNote } from '../shared/vault-config-note.ts'
import { today, type Status } from '../shared/schema.ts'

import { Actions } from './actions.ts'
import { WorkItemIndex } from './index.ts'
import { mountAll, unmountAll } from './mount.ts'
import { ChecklistComponents } from './ui/checklist.ts'
import type { RenderContext } from './ui/context.ts'
import { MoveModal } from './ui/move-modal.ts'
import { CreateBoardModal } from './ui/create-board-modal.ts'
import { createFirstBoard } from './first-board.ts'
import { replaceChangedSpan, stampObservedChange } from './updated.ts'
import { parseStatusColors, StatusColorSettingTab, type StatusColorKey, type StatusColors } from './settings.ts'
import { DASHBOARD_ICON, DASHBOARD_VIEW, DashboardView, type DashboardState } from './ui/dashboard-view.ts'
import {
  applyTickChanges, mergeTicks, parseDeviceDashboardState, parsePersonTicks, personTicks, safePersonFileName, splitLegacyDashboardState, withPersonTicks,
  type DashboardTicks,
} from './personal-state.ts'

const DASHBOARD_STORAGE_KEY = 'recursive-board:dashboard'

export default class RecursiveBoardPlugin extends Plugin {
  private index!: WorkItemIndex
  private actions!: Actions
  private expandedPath: string | null = null
  /** Paths whose text is being read instead of their board. Session state, never written. */
  private readonly peeking = new Set<string>()
  private readonly shownTabs = new Map<string, Status>()
  private readonly shownArchived = new Set<string>()
  /** Work items whose raw Properties panel is shown. Session only; a new note opens tidy. */
  private readonly shownProperties = new Set<string>()
  private readonly checklistComponents = new ChecklistComponents()
  /** Last observed document per editor, used to reject no-op editor notifications. */
  private readonly editorValues = new WeakMap<Editor, string>()
  private pending: number | null = null
  private unloaded = false
  private firstBoardNotice: Notice | null = null
  private firstBoardDismissed = false
  private storedData: Record<string, unknown> = {}
  private statusColors: StatusColors = {}
  private dashboard!: DashboardState

  override async onload(): Promise<void> {
    const storedData: unknown = await this.loadData()
    if (typeof storedData === 'object' && storedData !== null && !Array.isArray(storedData)) {
      this.storedData = Object.fromEntries(Object.entries(storedData))
    }
    this.statusColors = parseStatusColors(this.storedData.statusColors)
    await this.loadDashboardState()
    this.applyStatusColors()
    this.addSettingTab(new StatusColorSettingTab(
      this.app,
      this,
      () => this.statusColors,
      (key, color) => this.updateStatusColor(key, color),
      () => this.index?.config.maxAgents ?? null,
      (maxAgents) => this.updateMaxAgents(maxAgents),
      () => this.dashboard.you,
      (you) => this.saveDashboard({ you }),
      () => this.dashboard.webReviewMode,
      (webReviewMode) => this.saveDashboard({ webReviewMode }),
      () => this.personNames(),
    ))

    try {
      this.index = new WorkItemIndex(this.app, await this.readVaultConfig())
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      new Notice(`Recursive Board could not read ${VAULT_CONFIG_NOTE}: ${reason}`)
      throw error
    }
    this.actions = new Actions(this.app, this.index, () => this.dashboard.you)

    this.registerView(DASHBOARD_VIEW, (leaf) => new DashboardView(leaf, {
      index: this.index,
      actions: this.actions,
      state: () => this.dashboard,
      save: (patch) => this.saveDashboard(patch),
      personNames: () => this.personNames(),
      reloadTicks: () => this.loadPersonTicks(),
    }))
    this.addRibbonIcon(DASHBOARD_ICON, 'Open dashboard', () => void this.openDashboard())
    this.addCommand({
      id: 'open-dashboard',
      name: 'Open dashboard',
      callback: () => void this.openDashboard(),
    })

    this.rememberActiveEditor()
    this.registerEvent(this.app.workspace.on('editor-change', (editor) => this.editorChanged(editor)))

    // The cache is the source the board reads (the board index), so any change to it redraws.
    this.registerEvent(this.app.metadataCache.on('changed', () => this.stale()))
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.stale()))
    this.registerEvent(this.app.vault.on('create', (file) => this.vaultChanged(file.path)))
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (isVaultConfigEvent({ kind: 'modify', path: file.path })) void this.reloadConfig()
    }))
    this.registerEvent(this.app.vault.on('delete', (file) => this.vaultChanged(file.path)))
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.vaultChanged(file.path)
      if (isVaultConfigEvent({ kind: 'rename', path: file.path, oldPath })) void this.reloadConfig()
    }))

    this.registerEvent(this.app.workspace.on('layout-change', () => this.schedule()))
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
      this.rememberActiveEditor()
      this.schedule()
    }))
    this.registerEvent(this.app.workspace.on('file-open', () => {
      this.expandedPath = null // A new note means no card is expanded.
      this.shownProperties.clear()
      this.rememberActiveEditor()
      this.schedule()
    }))

    this.addCommand({
      id: 'create-first-board',
      name: 'Create your first board',
      callback: () => new CreateBoardModal(this.app, (title) => {
        void createFirstBoard(this.app, this.index, title)
      }).open(),
    })

    this.addCommand({
      id: 'toggle-board',
      name: 'Promote or demote this work item',
      checkCallback: (checking) => {
        const meta = this.index.get(this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null)
        if (!meta) return false
        if (!checking) void this.actions.setPromoted(meta, !meta.board)
        return true
      },
    })

    this.addCommand({
      id: 'go-to-parent',
      name: 'Go to parent work item',
      checkCallback: (checking) => {
        const meta = this.index.get(this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null)
        const parent = meta ? this.index.get(meta.parent) : null
        if (!meta) return false
        if (!checking) {
          if (parent) void this.actions.open(parent)
          else if (meta.parentLink) new Notice(`[[${meta.parentLink}]] does not resolve.`)
          else new Notice(`${meta.title} is the root.`)
        }
        return true
      },
    })

    this.addCommand({
      id: 'move-to',
      name: 'Move this work item to…',
      checkCallback: (checking) => {
        const meta = this.index.get(this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null)
        if (!meta || meta.parentLink === null) return false
        if (!checking) new MoveModal(this.app, this.index, this.actions, meta).open()
        return true
      },
    })

    // Obsidian's own file menu: the file explorer, a tab header, and the phone's "…" menu, where
    // a long press on a card fires no contextmenu event.
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      const meta = file instanceof TFile ? this.index.get(file) : null
      if (!meta || meta.parentLink === null) return
      menu.addItem((item) => item
        .setTitle('Move to…')
        .setIcon('folder-input')
        .onClick(() => new MoveModal(this.app, this.index, this.actions, meta).open()))
    }))

    // No default hotkey: Cmd+Z belongs to the editor. Bind one in Settings, Hotkeys.
    this.addCommand({
      id: 'undo',
      name: 'Undo last board action',
      callback: () => void this.actions.undo(),
    })
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.actions.undoStack.rename(oldPath, file.path)
    }))

    this.app.workspace.onLayoutReady(() => {
      if (!this.unloaded) {
        this.rememberActiveEditor()
        this.schedule()
        void this.showFirstBoardNotice()
      }
    })
  }

  override onunload(): void {
    this.unloaded = true
    if (this.pending !== null) window.clearTimeout(this.pending)
    this.peeking.clear()
    this.shownTabs.clear()
    this.shownArchived.clear()
    this.firstBoardNotice?.hide()
    this.firstBoardNotice = null
    unmountAll(this.app)
    this.checklistComponents.releaseAll()
  }

  private stale(): void {
    this.index.invalidate()
    if (this.index.all().length > 0) {
      this.firstBoardNotice?.hide()
      this.firstBoardNotice = null
    }
    this.schedule()
  }

  private async showFirstBoardNotice(): Promise<void> {
    if (this.index.all().length > 0 || this.firstBoardNotice || this.firstBoardDismissed) return
    this.firstBoardDismissed = this.storedData.firstBoardNoticeDismissed === true
    if (this.firstBoardDismissed || this.index.all().length > 0 || this.unloaded) return

    const fragment = createFragment((el) => {
      el.createSpan({ text: 'No work items yet. ' })
      const create = el.createEl('a', { text: 'Create your first board' })
      create.addEventListener('click', (event) => {
        event.preventDefault()
        this.firstBoardNotice?.hide()
        this.firstBoardNotice = null
        new CreateBoardModal(this.app, (title) => {
          void createFirstBoard(this.app, this.index, title)
        }).open()
      })
      el.createSpan({ text: ' ' })
      const dismiss = el.createEl('a', { text: 'Dismiss' })
      dismiss.addEventListener('click', (event) => {
        event.preventDefault()
        this.firstBoardDismissed = true
        this.firstBoardNotice?.hide()
        this.firstBoardNotice = null
        this.storedData = { ...this.storedData, firstBoardNoticeDismissed: true }
        void this.saveData(this.storedData)
      })
    })
    this.firstBoardNotice = new Notice(fragment, 0)
  }

  private async updateStatusColor(key: StatusColorKey, color: string | undefined): Promise<void> {
    const next = { ...this.statusColors }
    if (color === undefined) delete next[key]
    else next[key] = color
    this.statusColors = next
    this.applyStatusColors()

    if (Object.keys(next).length > 0) this.storedData.statusColors = next
    else delete this.storedData.statusColors
    await this.saveData(this.storedData)
  }

  private async saveDashboard(patch: Partial<DashboardState>): Promise<void> {
    const previousTicks = this.dashboard.ticks
    this.dashboard = { ...this.dashboard, ...patch, ...('you' in patch ? { ticks: {} } : {}) }
    if ('ticks' in patch) await this.savePersonTicks(patch.ticks ?? {}, previousTicks)
    const { you, root, focus, webReviewMode, finishedOpen, foldedGroups } = this.dashboard
    this.app.saveLocalStorage(DASHBOARD_STORAGE_KEY, { you, root, focus, webReviewMode, finishedOpen, foldedGroups })
    // These change what the dashboard draws or how a row opens, so it redraws at once.
    if ('you' in patch || 'webReviewMode' in patch) this.refreshDashboards()
  }

  /**
   * Loads device state, and moves older state into place once: the `dashboard` key of the first
   * dashboard, and the `people/<name>.json` file of the first per-person build, which Obsidian
   * Sync did not carry. Ticks live in the plugin data, per person (docs/adr/0045-personal-dashboard-state.md).
   */
  private async loadDashboardState(): Promise<void> {
    const local = this.app.loadLocalStorage(DASHBOARD_STORAGE_KEY)
    let device = parseDeviceDashboardState(local)
    let changed = false
    const legacy = this.storedData.dashboard
    if (legacy !== undefined) {
      const migration = splitLegacyDashboardState(legacy, local)
      device = migration.device
      if (migration.personName.trim() !== '') {
        const ticks = mergeTicks(personTicks(this.storedData, migration.personName), migration.ticks)
        this.storedData = withPersonTicks(this.storedData, migration.personName, ticks)
      }
      delete this.storedData.dashboard
      this.app.saveLocalStorage(DASHBOARD_STORAGE_KEY, device)
      changed = true
    }
    const fileName = safePersonFileName(device.you)
    if (fileName) {
      const adapter = this.app.vault.adapter
      const folder = normalizePath(`${this.manifest.dir}/people`)
      const path = `${folder}/${fileName}.json`
      if (await adapter.exists(path)) {
        const ticks = mergeTicks(personTicks(this.storedData, device.you), parsePersonTicks(await adapter.read(path)))
        this.storedData = withPersonTicks(this.storedData, device.you, ticks)
        // Save before the file goes, so a failed clean-up never loses a tick.
        await this.saveData(this.storedData)
        changed = false
        try {
          await adapter.remove(path)
          if ((await adapter.list(folder)).files.length === 0) await adapter.rmdir(folder, false)
        } catch (error) {
          console.warn('Recursive Board could not remove the old person file', error)
        }
      }
    }
    if (changed) await this.saveData(this.storedData)
    this.dashboard = { ...device, ticks: personTicks(this.storedData, device.you) }
  }

  /** Reads the plugin data from disk again, so ticks synced from another device are current. */
  private async freshData(): Promise<Record<string, unknown>> {
    const data: unknown = await this.loadData()
    this.storedData = typeof data === 'object' && data !== null && !Array.isArray(data) ? { ...data as Record<string, unknown> } : {}
    return this.storedData
  }

  private async loadPersonTicks(): Promise<DashboardTicks> {
    this.dashboard.ticks = personTicks(await this.freshData(), this.dashboard.you)
    return this.dashboard.ticks
  }

  /** Applies only this device's change to the stored ticks, so a tick made elsewhere survives. */
  private async savePersonTicks(ticks: DashboardTicks, previous: DashboardTicks): Promise<void> {
    const name = this.dashboard.you
    if (name.trim() === '') return
    const data = await this.freshData()
    this.storedData = withPersonTicks(data, name, applyTickChanges(personTicks(data, name), previous, ticks))
    await this.saveData(this.storedData)
  }

  /** Obsidian calls this when Sync changes the plugin data, for example a tick made on the phone. */
  override async onExternalSettingsChange(): Promise<void> {
    await this.freshData()
    this.statusColors = parseStatusColors(this.storedData.statusColors)
    this.applyStatusColors()
    this.dashboard.ticks = personTicks(this.storedData, this.dashboard.you)
    this.refreshDashboards()
  }

  private personNames(): string[] {
    return this.app.vault.getMarkdownFiles()
      .filter((file) => this.app.metadataCache.getFileCache(file)?.frontmatter?.['type'] === 'person')
      .map((file) => file.basename)
      .sort((a, b) => a.localeCompare(b))
  }

  /** Reuses an open dashboard tab, like the graph view. */
  private async openDashboard(): Promise<void> {
    const { workspace } = this.app
    let leaf = workspace.getLeavesOfType(DASHBOARD_VIEW)[0]
    if (!leaf) {
      leaf = workspace.getLeaf('tab')
      await leaf.setViewState({ type: DASHBOARD_VIEW, active: true })
    }
    await workspace.revealLeaf(leaf)
  }

  private refreshDashboards(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW)) {
      if (leaf.view instanceof DashboardView) leaf.view.refresh()
    }
  }

  private async updateMaxAgents(maxAgents: number | null): Promise<void> {
    try {
      const adapter = this.app.vault.adapter
      const noteExists = await adapter.exists(VAULT_CONFIG_NOTE)
      const noteText = noteExists ? await adapter.read(VAULT_CONFIG_NOTE) : null
      const legacyExists = !noteExists && await adapter.exists(WI_CONFIG_FILE)
      const config = noteText !== null
        ? parseConfigNote(noteText)
        : legacyExists ? parseLegacyConfig(await adapter.read(WI_CONFIG_FILE)) : {}
      parseVaultConfigValues(config, noteText !== null ? VAULT_CONFIG_NOTE : WI_CONFIG_FILE)
      if (maxAgents === null) delete config['maxAgents']
      else config['maxAgents'] = maxAgents
      await adapter.write(VAULT_CONFIG_NOTE, writeConfigNote(noteText, config))
      await this.reloadConfig()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      new Notice(`Recursive Board could not update ${VAULT_CONFIG_NOTE}: ${reason}`)
    }
  }

  private applyStatusColors(): void {
    const names: Readonly<Record<StatusColorKey, string>> = {
      options: '--wi-custom-rgb-options',
      doing: '--wi-custom-rgb-doing',
      done: '--wi-custom-rgb-done',
      blocked: '--wi-custom-rgb-blocked',
      agent: '--wi-custom-rgb-agent',
    }
    for (const key of ['options', 'doing', 'done', 'blocked', 'agent'] as const) {
      const color = this.statusColors[key]
      const value = color ? color.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16)).join(', ') : ''
      if (value) this.app.workspace.containerEl.style.setProperty(names[key], value)
      else this.app.workspace.containerEl.style.removeProperty(names[key])
    }
  }

  private rememberActiveEditor(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (view) this.editorValues.set(view.editor, view.editor.getValue())
  }

  private editorChanged(editor: Editor): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view || view.editor !== editor) return

    const current = editor.getValue()
    const previous = this.editorValues.get(editor)
    this.editorValues.set(editor, current)
    if (previous === undefined) return

    const stamped = stampObservedChange({ kind: 'editor', previous, current, stamp: today() })
    if (stamped !== current) replaceChangedSpan(editor, current, stamped)
  }

  private async readVaultConfig() {
    const file = this.app.vault.getFileByPath(VAULT_CONFIG_NOTE)
    const adapter = this.app.vault.adapter
    const noteText = file
      ? await this.app.vault.read(file)
      : await adapter.exists(VAULT_CONFIG_NOTE) ? await adapter.read(VAULT_CONFIG_NOTE) : null
    const text = noteText === null && await adapter.exists(WI_CONFIG_FILE)
      ? await adapter.read(WI_CONFIG_FILE)
      : null
    const config = noteText !== null ? parseVaultConfigNote(noteText) : parseVaultConfig(text)
    return { ...config, workItemFolder: normalizePath(config.workItemFolder) }
  }

  private async reloadConfig(): Promise<void> {
    try {
      this.index.setConfig(await this.readVaultConfig())
      this.schedule()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      new Notice(`Recursive Board could not read ${VAULT_CONFIG_NOTE}: ${reason}`)
    }
  }

  private vaultChanged(path: string): void {
    if (isVaultConfigEvent({ kind: 'create', path }) || isVaultConfigEvent({ kind: 'delete', path })) void this.reloadConfig()
    else this.stale()
  }

  /** Coalesces a burst of events into one redraw. A card move fires several. */
  private schedule(): void {
    if (this.unloaded) return
    if (this.pending !== null) window.clearTimeout(this.pending)
    this.pending = window.setTimeout(() => {
      this.pending = null
      mountAll(this.app, this.context())
      this.refreshDashboards()
    }, 30)
  }

  private context(): RenderContext {
    return {
      app: this.app,
      component: this,
      index: this.index,
      actions: this.actions,
      checklistComponents: this.checklistComponents,
      mobile: Platform.isMobile,
      expandedPath: this.expandedPath,
      expand: (path) => {
        this.expandedPath = path
        mountAll(this.app, this.context())
      },
      isPeeking: (path) => this.peeking.has(path),
      setPeek: (path, peeking) => {
        if (peeking) this.peeking.add(path)
        else this.peeking.delete(path)
        mountAll(this.app, this.context())
      },
      selectedTab: (path) => this.shownTabs.get(path),
      selectTab: (path, status) => { this.shownTabs.set(path, status) },
      isShowingProperties: (path) => this.shownProperties.has(path),
      toggleProperties: (path) => {
        if (this.shownProperties.has(path)) this.shownProperties.delete(path)
        else this.shownProperties.add(path)
        mountAll(this.app, this.context())
      },
      isShowingArchived: (path) => this.shownArchived.has(path),
      toggleArchived: (path) => {
        if (this.shownArchived.has(path)) this.shownArchived.delete(path)
        else this.shownArchived.add(path)
        this.schedule()
      },
    }
  }
}
