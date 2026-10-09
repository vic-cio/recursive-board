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
import { MarkdownView, Notice, normalizePath, Platform, Plugin, TFile, TFolder, type Editor } from 'obsidian'
import { parseVaultConfigValues, type VaultConfig } from '../shared/vault-config.ts'
import {
  boardSettingsIn, boardSettingsRecord, PLUGIN_DATA_FILE, readBoardSettings, withBoardSettings,
} from '../shared/board-settings.ts'
import { today, type Status } from '../shared/schema.ts'
import { withRaisedRulesMarker } from '../shared/rules-version.ts'

import { Actions } from './actions.ts'
import { WorkItemIndex } from './index.ts'
import { renameThenSave } from './rename-transaction.ts'
import { SerialQueue } from './serial-queue.ts'
import { mountAll, unmountAll } from './mount.ts'
import { ChecklistComponents } from './ui/checklist.ts'
import type { RenderContext } from './ui/context.ts'
import { MoveModal } from './ui/move-modal.ts'
import { openLinkTarget } from './ui/open-link.ts'
import { OPEN_WORK_ITEM_ICON, OpenModal } from './ui/open-modal.ts'
import { CreateBoardModal } from './ui/create-board-modal.ts'
import { createFirstBoard } from './first-board.ts'
import { registerCli } from './cli-handler.ts'
import { replaceChangedSpan, stampObservedChange } from './updated.ts'
import { parseStatusColors, StatusColorSettingTab, type StatusColorKey, type StatusColors } from './settings.ts'

/** Set on a device once it has shown the notice about missing board settings. */
const NO_BOARD_NOTICE_KEY = 'recursive-board:no-board-settings-notice'

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
  /** Board settings share one plugin data file, so each read-patch-write must finish first. */
  private readonly boardWrites = new SerialQueue()
  private pending: number | null = null
  private unloaded = false
  private firstBoardNotice: Notice | null = null
  private firstBoardDismissed = false
  private storedData: Record<string, unknown> = {}
  private statusColors: StatusColors = {}

  override async onload(): Promise<void> {
    const storedData: unknown = await this.loadData()
    if (typeof storedData === 'object' && storedData !== null && !Array.isArray(storedData)) {
      this.storedData = Object.fromEntries(Object.entries(storedData))
    }
    // The plugin is the one writer of the rules version marker (docs/adr/0079-the-rules-version-marker-lives-in-the-plugin-data.md).
    const raised = withRaisedRulesMarker(storedData)
    if (raised !== null) await this.saveData(this.storedData = raised)
    this.statusColors = parseStatusColors(this.storedData.statusColors)
    this.applyStatusColors()
    this.addSettingTab(new StatusColorSettingTab(
      this.app,
      this,
      () => this.statusColors,
      (key, color) => this.updateStatusColor(key, color),
      () => this.index?.config.maxAgents ?? null,
      (maxAgents) => this.updateBoard({ maxAgents }),
      {
        config: () => this.index.config,
        update: (patch) => this.updateBoard(patch),
        renameFolder: (path) => this.renameCardFolder(path),
        roots: () => this.index.all()
          .filter((item) => item.parentLink === null)
          .map((item) => ({ stem: item.stem, title: item.title }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      },
    ))

    try {
      this.index = new WorkItemIndex(this.app, normalizedConfig(readBoardSettings(this.storedData).config))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      new Notice(`Recursive Board could not read the board settings: ${reason}`)
      throw error
    }
    this.actions = new Actions(this.app, this.index)
    registerCli(this, Platform.isDesktopApp)

    this.rememberActiveEditor()
    this.registerEvent(this.app.workspace.on('editor-change', (editor) => this.editorChanged(editor)))

    // The cache is the source the board reads (the board index), so any change to it redraws.
    this.registerEvent(this.app.metadataCache.on('changed', () => this.stale()))
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.stale()))
    this.registerEvent(this.app.vault.on('create', () => this.stale()))
    this.registerEvent(this.app.vault.on('delete', () => this.stale()))
    this.registerEvent(this.app.vault.on('rename', () => this.stale()))

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
        void createFirstBoard(this.app, this.index, title, (defaultRoot) => this.updateBoard({ defaultRoot }))
      }).open(),
    })

    // The ribbon icon also lists it in the phone's ribbon menu.
    const openWorkItem = () => new OpenModal(this.app, this.index, this.actions).open()
    this.addRibbonIcon(OPEN_WORK_ITEM_ICON, 'Open work item…', openWorkItem)
    this.addCommand({
      id: 'open-work-item',
      name: 'Open work item…',
      icon: OPEN_WORK_ITEM_ICON,
      callback: openWorkItem,
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

    // obsidian://recursive-board?vault=<vault>&id=wi-xxxx opens the card, from any app.
    this.registerObsidianProtocolHandler('recursive-board', (params) => {
      this.app.workspace.onLayoutReady(() => void this.openLink(params.id))
    })

    this.app.workspace.onLayoutReady(() => {
      if (!this.unloaded) {
        this.rememberActiveEditor()
        this.schedule()
        void this.showFirstBoardNotice()
        this.showNoBoardNotice()
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

  /**
   * Opens the card a link names. On a cold start the metadata cache may still be resolving when
   * the layout is ready, so an id not found yet waits for the cache once before its notice.
   */
  private async openLink(id: string | undefined): Promise<void> {
    if (this.unloaded) return
    let target = openLinkTarget(this.index.all(), id)
    if (target.item === null && id?.trim()) {
      await this.cacheResolved()
      if (this.unloaded) return
      this.index.invalidate()
      target = openLinkTarget(this.index.all(), id)
    }
    if (target.notice !== null) new Notice(target.notice)
    if (target.item !== null) await this.actions.open(target.item)
  }

  /** Resolves on the next metadata cache `resolved` event, or after two seconds with none. */
  private cacheResolved(): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        window.clearTimeout(timer)
        this.app.metadataCache.offref(ref)
        resolve()
      }
      const ref = this.app.metadataCache.on('resolved', done)
      const timer = window.setTimeout(done, 2000)
    })
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
          void createFirstBoard(this.app, this.index, title, (defaultRoot) => this.updateBoard({ defaultRoot }))
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

  /** Reads the plugin data from disk again, so a change synced from another device is current. */
  private async freshData(): Promise<Record<string, unknown>> {
    const data: unknown = await this.loadData()
    this.storedData = typeof data === 'object' && data !== null && !Array.isArray(data) ? { ...data as Record<string, unknown> } : {}
    return this.storedData
  }

  /** Obsidian calls this when Sync changes the plugin data, for example a setting changed on the phone. */
  override async onExternalSettingsChange(): Promise<void> {
    await this.freshData()
    this.reloadConfig()
    this.statusColors = parseStatusColors(this.storedData.statusColors)
    this.applyStatusColors()
  }

  private personNames(): string[] {
    return this.app.vault.getMarkdownFiles()
      .filter((file) => this.app.metadataCache.getFileCache(file)?.frontmatter?.['type'] === 'person')
      .map((file) => file.basename)
      .sort((a, b) => a.localeCompare(b))
  }

  /**
   * Writes the board settings into the plugin data, the one place they live
   * (docs/adr/0050-board-settings-in-plugin-data.md). Reads the file first, so a change synced
   * from another device survives.
   */
  private async updateBoard(patch: Partial<VaultConfig>): Promise<void> {
    await this.boardWrites.run(async () => {
      try {
        await this.saveBoardPatch(patch)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        new Notice(`Recursive Board could not save the board settings: ${reason}`)
      }
    })
  }

  /** Apply one patch after the prior queued save has updated the in-memory config. */
  private async saveBoardPatch(patch: Partial<VaultConfig>): Promise<void> {
    const data = await this.freshData()
    const stored = boardSettingsIn(data)
    const base = stored !== null ? parseVaultConfigValues(stored, PLUGIN_DATA_FILE) : this.index.config
    const next = parseVaultConfigValues(boardSettingsRecord({ ...base, ...patch }), PLUGIN_DATA_FILE)
    this.storedData = withBoardSettings(data, next)
    await this.saveData(this.storedData)
    this.reloadConfig()
  }

  /**
   * Renames the card folder in one step, then points the board at it. Links name files, not
   * folders, so they keep working. A folder that already exists is read as it is.
   */
  private async renameCardFolder(target: string): Promise<void> {
    try {
      const to = normalizePath(parseVaultConfigValues({ workItemFolder: target }, 'Card folder').workItemFolder)
      const existing = this.app.vault.getAbstractFileByPath(to)
      if (existing !== null && !(existing instanceof TFolder)) throw new Error(`${to} is a file, not a folder.`)
      const current = this.app.vault.getFolderByPath(this.index.config.workItemFolder)
      await this.boardWrites.run(async () => {
        if (existing === null && current !== null) {
          const parent = to.includes('/') ? to.slice(0, to.lastIndexOf('/')) : ''
          if (parent !== '' && this.app.vault.getAbstractFileByPath(parent) === null) await this.app.vault.createFolder(parent)
          let renamedPath = current.path
          await renameThenSave(
            async (path) => {
              const folder = this.app.vault.getFolderByPath(renamedPath)
              if (folder === null) throw new Error(`Could not find the card folder at ${path}.`)
              await this.app.fileManager.renameFile(folder, path)
              renamedPath = path
            },
            current.path,
            to,
            () => this.saveBoardPatch({ workItemFolder: to }),
          )
        } else {
          await this.saveBoardPatch({ workItemFolder: to })
        }
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      new Notice(`Recursive Board could not rename the card folder: ${reason}`)
    }
  }

  /** A device whose plugin data has no board key: most often, plugin settings sync is off here. */
  private showNoBoardNotice(): void {
    if (boardSettingsIn(this.storedData) !== null) return
    if (this.index.all().length === 0) return // An empty vault gets the first-board notice instead.
    if (this.app.loadLocalStorage(NO_BOARD_NOTICE_KEY) === true) return
    this.app.saveLocalStorage(NO_BOARD_NOTICE_KEY, true)
    new Notice('No board settings found. Turn on plugin settings sync on this device, or set them in the Recursive Board settings tab.', 0)
  }

  private applyStatusColors(): void {
    const names: Readonly<Record<StatusColorKey, string>> = {
      options: '--wi-custom-rgb-options',
      doing: '--wi-custom-rgb-doing',
      done: '--wi-custom-rgb-done',
      agent: '--wi-custom-rgb-agent',
    }
    for (const key of ['options', 'doing', 'done', 'agent'] as const) {
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

  private reloadConfig(): void {
    try {
      this.index.setConfig(normalizedConfig(readBoardSettings(this.storedData).config))
      this.schedule()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      new Notice(`Recursive Board could not read the board settings: ${reason}`)
    }
  }

  /** Coalesces a burst of events into one redraw. A card move fires several. */
  private schedule(): void {
    if (this.unloaded) return
    if (this.pending !== null) window.clearTimeout(this.pending)
    this.pending = window.setTimeout(() => {
      this.pending = null
      mountAll(this.app, this.context())
    }, 30)
  }

  private context(): RenderContext {
    return {
      app: this.app,
      component: this,
      index: this.index,
      actions: this.actions,
      personNames: () => this.personNames(),
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

function normalizedConfig(config: VaultConfig): VaultConfig {
  return { ...config, workItemFolder: normalizePath(config.workItemFolder) }
}
