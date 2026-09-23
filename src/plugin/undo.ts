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
 * later change. That is what makes undo safe on a synced vault, and it keeps the operation to
 * one file, as every board write is.
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
  static restore(entry: UndoEntry, current: string): string | null {
    return current === entry.after ? entry.before : null
  }
}
