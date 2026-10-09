/**
 * The Node storage port: the vault on the filesystem, for wi (docs/adr/0076-a-storage-port-and-a-command-runner.md).
 *
 * Each operation maps a vault-relative path onto the root and calls the writes in `write.ts`:
 * a write is a temp file and a rename, a create is a hard link that never replaces a file, and
 * a lock is a file in the OS temp folder, so two wi processes on one machine exclude each other.
 */
import { mkdir, readdir, readFile, rename, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'

import { PathExistsError, type StoragePort } from '../shared/storage.ts'
import { withFileLock, writeAtomic, writeNew } from './write.ts'

export function nodePort(root: string): StoragePort {
  const abs = (path: string) => path === '' ? root : join(root, ...path.split('/'))
  const rel = (path: string) => path.slice(root.length + 1).split(sep).join('/')

  return {
    async list(folder, skip = new Set()) {
      const dir = abs(folder)
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true, recursive: true })
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT' || code === 'ENOTDIR') return []
        throw error
      }
      const files: string[] = []
      for (const entry of entries) {
        if (entry.isDirectory()) continue
        const path = `${rel(join(entry.parentPath ?? dir, entry.name))}`
        const folders = path.split('/').slice(0, -1)
        if (folders.some((part) => skip.has(part))) continue
        files.push(path)
      }
      return files
    },
    read: (path) => readFile(abs(path), 'utf8'),
    async exists(path) {
      try {
        await stat(abs(path))
        return true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
        throw error
      }
    },
    write: (path, text) => writeAtomic(abs(path), text),
    async create(path, text) {
      try {
        await writeNew(abs(path), text)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new PathExistsError(path)
        throw error
      }
    },
    update(path, edit) {
      const file = abs(path)
      return withFileLock(file, async () => {
        const current = await readFile(file, 'utf8')
        const next = edit(current)
        if (next !== current) await writeAtomic(file, next)
        return next
      })
    },
    rename: (from, to) => rename(abs(from), abs(to)),
    async mkdir(path) {
      await mkdir(abs(path), { recursive: true })
    },
    withLock: (key, fn) => withFileLock(abs(key), fn),
  }
}
