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
import { MarkdownView, Notice, normalizePath, Platform, Plugin, TFile } from 'obsidian'
import { parseVaultConfig, WI_CONFIG_FILE } from '../shared/vault-config.ts'
import type { Status } from '../shared/schema.ts'

import { Actions } from './actions.ts'
import { WorkItemIndex } from './index.ts'
import { mountAll, unmountAll } from './mount.ts'
import { ChecklistComponents } from './ui/checklist.ts'
import type { RenderContext } from './ui/context.ts'
import { MoveModal } from './ui/move-modal.ts'

export default class RecursiveBoardPlugin extends Plugin {
  private index!: WorkItemIndex
  private actions!: Actions
  private expandedPath: string | null = null
  /** Paths whose text is being read instead of their board. Session state, never written. */
  private readonly peeking = new Set<string>()
  private readonly shownTabs = new Map<string, Status>()
  private readonly shownArchived = new Set<string>()
  private readonly checklistComponents = new ChecklistComponents()
  private pending: number | null = null
  private unloaded = false

  override async onload(): Promise<void> {
    this.index = new WorkItemIndex(this.app, await this.readVaultConfig())
    this.actions = new Actions(this.app, this.index)

    // The cache is the source the board reads (the board index), so any change to it redraws.
    this.registerEvent(this.app.metadataCache.on('changed', () => this.stale()))
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.stale()))
    this.registerEvent(this.app.vault.on('create', (file) => this.vaultChanged(file.path)))
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (file.path === WI_CONFIG_FILE) void this.reloadConfig()
    }))
    this.registerEvent(this.app.vault.on('delete', (file) => this.vaultChanged(file.path)))
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.vaultChanged(file.path)
      if (oldPath === WI_CONFIG_FILE) void this.reloadConfig()
    }))

    this.registerEvent(this.app.workspace.on('layout-change', () => this.schedule()))
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.schedule()))
    this.registerEvent(this.app.workspace.on('file-open', () => {
      this.expandedPath = null // A new note means no card is expanded.
      this.schedule()
    }))

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
      if (!this.unloaded) this.schedule()
    })
  }

  override onunload(): void {
    this.unloaded = true
    if (this.pending !== null) window.clearTimeout(this.pending)
    this.peeking.clear()
    this.shownTabs.clear()
    this.shownArchived.clear()
    unmountAll(this.app)
    this.checklistComponents.releaseAll()
  }

  private stale(): void {
    this.index.invalidate()
    this.schedule()
  }

  private async readVaultConfig() {
    const file = this.app.vault.getFileByPath(WI_CONFIG_FILE)
    const adapter = this.app.vault.adapter
    const text = file
      ? await this.app.vault.read(file)
      : await adapter.exists(WI_CONFIG_FILE) ? await adapter.read(WI_CONFIG_FILE) : null
    const config = parseVaultConfig(text)
    return { ...config, workItemFolder: normalizePath(config.workItemFolder) }
  }

  private async reloadConfig(): Promise<void> {
    try {
      this.index.setConfig(await this.readVaultConfig())
      this.schedule()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      new Notice(`Recursive Board could not read ${WI_CONFIG_FILE}: ${reason}`)
    }
  }

  private vaultChanged(path: string): void {
    if (path === WI_CONFIG_FILE) void this.reloadConfig()
    else this.stale()
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
      isShowingArchived: (path) => this.shownArchived.has(path),
      toggleArchived: (path) => {
        if (this.shownArchived.has(path)) this.shownArchived.delete(path)
        else this.shownArchived.add(path)
        this.schedule()
      },
    }
  }
}
