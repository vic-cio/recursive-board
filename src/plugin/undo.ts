/**
 * Undo for the board's own writes.
 *
 * Obsidian's Cmd+Z covers text typed in the editor. A status change, a move or a promotion is a
 * write straight to the file, which the editor never sees, so nothing could reverse it except
 * doing the opposite by hand.
 *
 * An entry holds the file's whole text before and after the write. Undo restores the before-text
 * only when the file still holds exactly the after-text. If anything has touched the file since,
 * such as a sync from the phone or an agent's `wi` call, undo refuses rather than overwrite that
 * later change. That is what makes undo safe on a synced vault. One add may record a child and a
 * first-child parent promotion in the same entry, so one Undo action restores both files.
 *
 * Creation is recorded too: undoing an add trashes the new file, again only if it is untouched.
 * Removal is not, because Obsidian's trash already reverses it.
 *
 * Session state only. Nothing here is written to the vault. Imports nothing, so it runs on iOS.
 */

export interface UndoEntry {
  kind: 'edit' | 'create'
  /** Vault path of the file the write touched. */
  path: string
  /** The file's text before the write. Empty for a creation. */
  before: string
  /** The file's text right after the write. */
  after: string
  /** What the write did, for the notice: "move Card typography pass". */
  label: string
  /** A parent edit that belongs to the same add action. */
  parentEdit?: { path: string; before: string; after: string }
}

export class UndoStack {
  private readonly limit: number
  private entries: UndoEntry[] = []

  constructor(limit = 50) {
    this.limit = limit
  }

  record(entry: UndoEntry): void {
    if (entry.kind === 'edit' && entry.before === entry.after) return
    this.entries.push(entry)
    if (this.entries.length > this.limit) this.entries.shift()
  }

  peek(): UndoEntry | undefined {
    return this.entries[this.entries.length - 1]
  }

  pop(): UndoEntry | undefined {
    return this.entries.pop()
  }

  /** Keeps a pending undo attached to its file when the file is renamed. */
  rename(from: string, to: string): void {
    for (const entry of this.entries) if (entry.path === from) entry.path = to
  }

  /**
   * The text to write back, or null when the file changed since the write and must be left alone.
   */
  static restore(entry: Pick<UndoEntry, 'before' | 'after'>, current: string): string | null {
    return current === entry.after ? entry.before : null
  }

  /** Returns both original files only when the add and its parent promotion are untouched. */
  static restoreCreate(
    entry: UndoEntry,
    childCurrent: string,
    parentCurrent: string,
  ): { childBefore: string; parentBefore: string | undefined } | null {
    const childBefore = UndoStack.restore(entry, childCurrent)
    if (childBefore === null) return null
    if (!entry.parentEdit) return { childBefore, parentBefore: undefined }
    const parentBefore = UndoStack.restore(entry.parentEdit, parentCurrent)
    return parentBefore === null ? null : { childBefore, parentBefore }
  }

  /** Created items stay when another item now depends on their path. */
  static canTrashCreated(childCount: number): boolean {
    return childCount === 0
  }
}
