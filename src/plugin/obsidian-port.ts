/**
 * The Obsidian storage port: the open vault, for the plugin (docs/adr/0076-a-storage-port-and-a-command-runner.md).
 *
 * A file Obsidian indexes is read and written through `app.vault`, so its cache and open editors
 * see the change at once; a hidden file, which Obsidian does not index, goes through
 * `app.vault.adapter`. An update is `process`, Obsidian's own read-modify-write. A lock is a
 * queue in this process: it orders the plugin's own commands, and cannot exclude a wi process.
 * This module imports only types from 'obsidian', so node --test can load it.
 */
import type { DataAdapter, TFile, Vault } from 'obsidian'

import { PathExistsError, type StoragePort } from '../shared/storage.ts'
import { SerialQueue } from './serial-queue.ts'

/** The part of the Obsidian API the port uses, so a test can supply a fake. */
export interface ObsidianStorage {
  vault: Pick<Vault, 'getFileByPath' | 'read' | 'modify' | 'create' | 'process'> & {
    adapter: Pick<DataAdapter, 'list' | 'read' | 'write' | 'exists' | 'process' | 'rename' | 'mkdir'>
  }
}

/** Obsidian indexes no file under a folder, or with a name, that starts with a dot. */
function isHidden(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.'))
}

/** Runs tasks with one key one at a time. A key's queue goes when its last task ends. */
class KeyedQueues {
  private readonly queues = new Map<string, { queue: SerialQueue; pending: number }>()

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const entry = this.queues.get(key) ?? { queue: new SerialQueue(), pending: 0 }
    this.queues.set(key, entry)
    entry.pending++
    try {
      return await entry.queue.run(task)
    } finally {
      if (--entry.pending === 0) this.queues.delete(key)
    }
  }
}

export function obsidianPort(app: ObsidianStorage): StoragePort {
  const { vault } = app
  const { adapter } = vault
  const locks = new KeyedQueues()
  const indexed = (path: string): TFile | null => isHidden(path) ? null : vault.getFileByPath(path)
  const read = (path: string) => {
    const file = indexed(path)
    return file ? vault.read(file) : adapter.read(path)
  }

  return {
    async list(folder, skip = new Set()) {
      if (folder !== '' && !(await adapter.exists(folder))) return []
      const files: string[] = []
      const walk = async (dir: string): Promise<void> => {
        const listed = await adapter.list(dir === '' ? '/' : dir)
        files.push(...listed.files)
        for (const sub of listed.folders) {
          if (!skip.has(sub.slice(sub.lastIndexOf('/') + 1))) await walk(sub)
        }
      }
      await walk(folder)
      return files
    },
    read,
    exists: (path) => adapter.exists(path),
    async write(path, text) {
      const file = indexed(path)
      if (file) await vault.modify(file, text)
      else await adapter.write(path, text)
    },
    create: (path, text) => locks.run(path, async () => {
      if (await adapter.exists(path)) throw new PathExistsError(path)
      if (isHidden(path)) await adapter.write(path, text)
      else await vault.create(path, text)
    }),
    update: (path, edit) => locks.run(path, async () => {
      // An edit that changes nothing writes nothing, as on the Node port.
      const current = await read(path)
      const next = edit(current)
      if (next === current) return current
      const again = (data: string) => data === current ? next : edit(data)
      const file = indexed(path)
      return file ? vault.process(file, again) : adapter.process(path, again)
    }),
    rename: (from, to) => adapter.rename(from, to),
    async mkdir(path) {
      let dir = ''
      for (const part of path.split('/')) {
        dir = dir === '' ? part : `${dir}/${part}`
        if (!(await adapter.exists(dir))) await adapter.mkdir(dir)
      }
    },
    withLock: (key, fn) => locks.run(key, fn),
  }
}
