/**
 * Every write the plugin makes.
 *
 * The rules live in `shared/transitions.ts`, so a card ticked here and a card moved by `wi` do
 * exactly the same thing. This module is only the Obsidian plumbing around them.
 *
 * `vault.process` is an atomic read-modify-write, and the edits inside it are line-wise, so a
 * toggle rewrites one line and copies every other byte. That keeps the Git noise decision U3
 * warned about down to what actually changed.
 */
import { Notice, TFile, type App } from 'obsidian'

import { applyEdits, withStamp, type Edit } from '../shared/edits.ts'
import {
  boardEdits, moveEdits, moveRefusal, statusEdits, untickTarget,
} from '../shared/transitions.ts'
import { BOARDS, fileNameFor, newId, today, type Status } from '../shared/schema.ts'
import { renderWorkItem } from '../shared/work-item.ts'
import type { WorkItemIndex, WorkItemMeta } from './index.ts'
import { UndoStack } from './undo.ts'

export class Actions {
  private readonly app: App
  private readonly index: WorkItemIndex
  /** Every board write, so it can be reversed. Session only (see `undo.ts`). */
  readonly undoStack = new UndoStack()

  constructor(app: App, index: WorkItemIndex) {
    this.app = app
    this.index = index
  }

  private async edit(file: TFile, edits: readonly Edit[], label: string): Promise<void> {
    let before = ''
    const after = await this.app.vault.process(file, (data) => {
      before = data
      return applyEdits(data, withStamp(edits))
    })
    this.undoStack.record({ kind: 'edit', path: file.path, before, after, label })
  }

  /**
   * Reverses the most recent board write, when its file is exactly as that write left it.
   * A file changed since is left alone and its entry dropped: undo never overwrites a later edit.
   */
  async undo(): Promise<void> {
    const entry = this.undoStack.pop()
    if (!entry) {
      new Notice('Nothing to undo.')
      return
    }
    const file = this.app.vault.getFileByPath(entry.path)
    if (!file) {
      new Notice(`Cannot undo ${entry.label}: ${entry.path} is gone.`)
      return
    }
    const current = await this.app.vault.read(file)
    const restored = UndoStack.restore(entry, current)
    if (restored === null) {
      new Notice(`Cannot undo ${entry.label}: the file has changed since.`)
      return
    }
    const done = await this.run(`undo ${entry.label}`, async () => {
      if (entry.kind === 'create') await this.app.fileManager.trashFile(file)
      else await this.app.vault.modify(file, restored)
      return true
    })
    if (done) new Notice(`Undid ${entry.label}`)
  }

  /** Moves a card between columns. One file, one write, never the parent. */
  async setStatus(meta: WorkItemMeta, to: Status): Promise<void> {
    const edits = statusEdits(meta.status, to, meta.prevStatus !== undefined)
    if (edits === null) return
    await this.run(`move ${meta.title}`, () => this.edit(meta.file, edits, `mark ${meta.title} ${to}`))
  }

  /** Ticking a checklist box. Unticking restores exactly what the item was (decision U2). */
  async setDone(meta: WorkItemMeta, done: boolean): Promise<void> {
    await this.setStatus(meta, done ? 'done' : untickTarget(meta.prevStatus))
  }

  /** The promote toggle. Demotion deletes the key rather than writing `board: false`. */
  async setPromoted(meta: WorkItemMeta, promoted: boolean): Promise<void> {
    if (meta.board === promoted) return
    await this.run(
      promoted ? `promote ${meta.title}` : `demote ${meta.title}`,
      () => this.edit(meta.file, boardEdits(promoted), `${promoted ? 'promote' : 'demote'} ${meta.title}`),
    )
  }

  /**
   * Why `meta` cannot move under `target`, or null when it can. The picker uses this to leave
   * out every target that would make the parent chain loop, so a refused move is never offered.
   */
  moveRefusal(meta: WorkItemMeta, target: WorkItemMeta): string | null {
    return moveRefusal({
      item: meta.file.path,
      target: target.file.path,
      isRoot: meta.parentLink === null,
      parentOf: (path) => {
        const file = this.app.vault.getFileByPath(path)
        return this.index.get(file)?.parent?.path ?? null
      },
    })
  }

  /**
   * Moving a card to another board. It rewrites the moved item's `parent` and nothing else, the
   * same rule `wi move` applies: the status stays, and the item's children follow it by link.
   */
  async move(meta: WorkItemMeta, target: WorkItemMeta): Promise<void> {
    const refusal = this.moveRefusal(meta, target)
    if (refusal !== null) {
      new Notice(`Cannot move ${meta.title} under ${target.title}: ${refusal}`)
      return
    }
    const current = meta.parent ? meta.parent.basename : meta.parentLink
    const edits = moveEdits(current, target.stem)
    if (edits === null) return
    const done = await this.run(`move ${meta.title}`, async () => {
      await this.edit(meta.file, edits, `move ${meta.title}`)
      return true
    })
    if (done) this.undoableNotice(`Moved ${meta.title} to ${target.title}`)
  }

  /**
   * The add row at the foot of a column (decision u7).
   * Typing a title and pressing enter is one action, which is what makes a board a capture
   * surface rather than a report.
   */
  async createChild(parent: WorkItemMeta, rawTitle: string, status: Status): Promise<TFile | null> {
    const title = rawTitle.trim()
    if (title === '') return null

    const id = newId(this.index.takenIds())
    const stem = fileNameFor(title, id, this.index.takenStems())
    const path = `${BOARDS}/${stem}.md`

    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`${path} already exists. Nothing was written.`)
      return null
    }

    const stamp = today()
    const text = renderWorkItem({
      id,
      title,
      status,
      parentStem: parent.stem,
      // Inheritance costs nothing, and without it the badges are blank on the items you create
      // most often.
      owner: parent.owner,
      agent: parent.agent,
      created: stamp,
      updated: stamp,
    })

    const created = await this.run(`create ${title}`, () => this.app.vault.create(path, text))
    if (created) this.undoStack.record({ kind: 'create', path, before: '', after: text, label: `add ${title}` })
    return created
  }

  /**
   * Removing a work item, which is the missing inverse of the add row.
   *
   * It refuses when the item has children. Deleting a parent does not delete its children: it
   * leaves them pointing at a file that no longer exists, which integrity rule 4 forbids
   * repairing silently and decision u8 shows is invisible on every board. Refusing is the only
   * answer that does not quietly lose work.
   *
   * The confirmation is Obsidian's own, so it honours the vault's "Deleted files" setting: a
   * deletion goes to the system trash, to `.trash`, or is permanent, according to what the maintainer
   * already chose. The plugin does not get to decide how recoverable this is.
   *
   * Returns true when the file was removed.
   */
  async remove(meta: WorkItemMeta): Promise<boolean> {
    const children = this.index.childrenOf(meta.file)
    if (children.length > 0) {
      const names = children.slice(0, 3).map((c) => c.title).join(', ')
      const more = children.length > 3 ? `, and ${children.length - 3} more` : ''
      new Notice(
        `${meta.title} has ${children.length} children: ${names}${more}. ` +
        'Move or delete them first, or they would appear on no board.',
        8000,
      )
      return false
    }
    return (await this.app.fileManager.promptForDeletion(meta.file)) ?? false
  }

  /** Opens a work item, which is how a card is navigated into. */
  async open(meta: WorkItemMeta, newLeaf = false): Promise<void> {
    await this.app.workspace.getLeaf(newLeaf).openFile(meta.file)
  }

  /**
   * A notice with an Undo button. Used for a move, which sends the card off the screen you are
   * looking at, so it is the write most in need of a visible way back, and the phone has no hotkey.
   */
  private undoableNotice(message: string): void {
    const fragment = createFragment((f) => {
      f.createSpan({ text: `${message}. ` })
      const link = f.createEl('a', { text: 'Undo', href: '#' })
      link.addEventListener('click', (event) => {
        event.preventDefault()
        notice.hide()
        void this.undo()
      })
    })
    const notice = new Notice(fragment, 6000)
  }

  private async run<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      new Notice(`Recursive Board could not ${what}: ${reason}`)
      return null
    }
  }
}
