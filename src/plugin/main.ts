/**
 * Recursive Board.
 *
 * A work item's children render as a checklist, or as four columns once you promote it. The
 * plugin is a view and never the database: everything it shows comes from frontmatter, and
 * everything it writes is one key on one file.
 *
 * Decision D1 requires this to load on iOS, so nothing in this bundle may import `node`, `fs`,
 * `path`, `child_process` or `electron`. Two guards enforce that: `tsconfig.plugin.json` has no
 * Node types, and `build/forbidden-imports.mjs` fails the build.
 */
import { MarkdownView, Notice, Platform, Plugin, TFile } from 'obsidian'

import { Actions } from './actions.ts'
import { WorkItemIndex } from './index.ts'
import { mountAll, unmountAll } from './mount.ts'
import type { RenderContext } from './ui/context.ts'
import { MoveModal } from './ui/move-modal.ts'

export default class RecursiveBoardPlugin extends Plugin {
  private index!: WorkItemIndex
  private actions!: Actions
  private expandedPath: string | null = null
  /** Paths whose text is being read instead of their board. Session state, never written. */
  private readonly peeking = new Set<string>()
  private pending: number | null = null

  override async onload(): Promise<void> {
    this.index = new WorkItemIndex(this.app)
    this.actions = new Actions(this.app, this.index)

    // The cache is the source the board reads (decision D4), so any change to it redraws.
    this.registerEvent(this.app.metadataCache.on('changed', () => this.stale()))
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.stale()))
    this.registerEvent(this.app.vault.on('create', () => this.stale()))
    this.registerEvent(this.app.vault.on('delete', () => this.stale()))
    this.registerEvent(this.app.vault.on('rename', () => this.stale()))

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

    // A phone has no devtools console (risk 3). This writes what the layout actually is into the
    // plugin's own folder, which iCloud carries back to the Mac to be read there.
    this.addCommand({
      id: 'write-layout-report',
      name: 'Write a layout report for debugging',
      callback: () => void this.writeLayoutReport(),
    })

    this.app.workspace.onLayoutReady(() => this.schedule())
  }

  override onunload(): void {
    if (this.pending !== null) window.clearTimeout(this.pending)
    this.peeking.clear()
    unmountAll(this.app)
  }

  private async writeLayoutReport(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view) {
      new Notice('Open a work item first.')
      return
    }
    const describe = (el: Element) => {
      const style = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(),
        cls: el.className,
        top: Math.round(box.top),
        left: Math.round(box.left),
        width: Math.round(box.width),
        height: Math.round(box.height),
        display: style.display,
        flexDirection: style.flexDirection,
        alignItems: style.alignItems,
        position: style.position,
        flex: style.flex,
        minHeight: style.minHeight,
        padding: style.padding,
        margin: style.margin,
      }
    }
    const sizers = [...view.contentEl.querySelectorAll('.markdown-preview-sizer, .cm-sizer')]
    const report = {
      at: new Date().toISOString(),
      mobile: Platform.isMobile,
      mode: view.getMode(),
      file: view.file?.path,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bodyClasses: document.body.className,
      contentEl: describe(view.contentEl),
      sizers: sizers.map((sizer) => ({
        self: describe(sizer),
        parent: sizer.parentElement ? describe(sizer.parentElement) : null,
        children: [...sizer.children].map(describe),
      })),
      content: [...view.contentEl.querySelectorAll('.cm-contentContainer, .cm-contentContainer > *')]
        .map((el) => ({ ...describe(el), paddingBottom: getComputedStyle(el).paddingBottom })),
      regions: [...view.contentEl.querySelectorAll('.wi-region')].map((el) => ({
        ...describe(el),
        childCount: el.children.length,
      })),
      // The phone board, from the pane down to its first card: a width wrong anywhere shows here.
      board: [...document.querySelectorAll(
        '.wi-takeover, .wi-takeover-body, .wi-tabbed, .wi-tabbed > .wi-board, .wi-tabbed .wi-column, .wi-tabbed .wi-stack, .wi-tabbed .wi-card',
      )].slice(0, 8).map(describe),
    }
    const path = `${this.manifest.dir}/layout-report.json`
    await this.app.vault.adapter.write(path, JSON.stringify(report, null, 2))
    // iCloud can hold the file back for minutes, so the board's widths also go on screen, where a
    // screenshot carries them at once.
    const widths = report.board
      .map((b) => `${String(b.cls).split(' ').find((c) => c.startsWith('wi-')) ?? b.tag} ${b.width} ${b.display} ${b.flexDirection}`)
      .join('\n')
    new Notice(`Wrote ${path}\nviewport ${report.viewport.width}\n${widths}`, 60_000)
  }

  private stale(): void {
    this.index.invalidate()
    this.schedule()
  }

  /** Coalesces a burst of events into one redraw. A card move fires several. */
  private schedule(): void {
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
      refresh: () => this.schedule(),
    }
  }
}
