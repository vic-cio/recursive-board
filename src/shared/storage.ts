/**
 * The storage port: every vault read and write the shared rules make (docs/adr/0076-a-storage-port-and-a-command-runner.md).
 *
 * wi supplies a Node port over the filesystem, and the plugin an Obsidian port over `app.vault`.
 * A command written against this interface runs the same way on both. Every path is
 * vault-relative, with forward slashes and no leading slash; the empty string is the vault root.
 * This module imports nothing from Node, so the plugin bundle can carry it to iOS.
 */
export interface StoragePort {
  /**
   * Every file under `folder`, at any depth, hidden files included, as vault-relative paths.
   * A folder whose name is in `skip` is not entered. A missing folder lists as empty.
   */
  list(folder: string, skip?: ReadonlySet<string>): Promise<string[]>
  /** The file's text. Throws when the file is missing. */
  read(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  /** Replaces the file's text, or creates the file. A reader sees the old text or the new, never a part. */
  write(path: string, text: string): Promise<void>
  /** Creates a file that must not exist yet. Throws a PathExistsError, and changes nothing, when it does. */
  create(path: string, text: string): Promise<void>
  /**
   * Re-reads the file under its lock, and writes what `edit` returns when that differs.
   * Returns the text the file holds afterwards. `edit` may throw to refuse; nothing is written then.
   */
  update(path: string, edit: (current: string) => string): Promise<string>
  /** Moves a file. The target folder must exist. */
  rename(from: string, to: string): Promise<void>
  /** Creates a folder and every missing folder above it. An existing folder is fine. */
  mkdir(path: string): Promise<void>
  /**
   * Runs `fn` while every other holder of the same key on this port waits. The key is a
   * vault-relative path, which need not exist: `.wi-move` locks every move in the vault.
   */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>
}

/** The error `create` throws when the path is taken. Shared code tests for it with isPathExists. */
export class PathExistsError extends Error {
  readonly path: string
  constructor(path: string) {
    super(`${path} already exists.`)
    this.name = 'PathExistsError'
    this.path = path
  }
}

export function isPathExists(error: unknown): error is PathExistsError {
  return error instanceof PathExistsError
}

/** The file's text, or null when it is missing. */
export async function readIfPresent(port: StoragePort, path: string): Promise<string | null> {
  if (!(await port.exists(path))) return null
  try {
    return await port.read(path)
  } catch (error) {
    if (!(await port.exists(path))) return null // Removed between the two looks.
    throw error
  }
}

/** Joins vault-relative path parts with forward slashes, dropping empty parts. */
export function joinPath(...parts: string[]): string {
  return parts.flatMap((part) => part.split('/')).filter((part) => part !== '').join('/')
}
