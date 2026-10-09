/**
 * An in-memory fake of the Obsidian API that the Obsidian port uses, for tests only.
 *
 * It keeps Obsidian's rules that matter to the port: a hidden file is not indexed, so
 * getFileByPath does not find it; create refuses a taken path or a missing folder; list gives
 * one folder's files and folders as vault-relative paths, with `/` for the root.
 */
import type { TFile } from 'obsidian'

import type { ObsidianStorage } from './obsidian-port.ts'

export interface FakeObsidian extends ObsidianStorage {
  /** Every file's text by path. */
  files: Map<string, string>
  folders: Set<string>
}

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

export function fakeObsidian(files: Record<string, string> = {}, folders: readonly string[] = []): FakeObsidian {
  const store = new Map<string, string>()
  const dirs = new Set<string>([''])
  const addFolder = (path: string) => {
    for (let dir = path; dir !== '' && !dirs.has(dir); dir = parentOf(dir)) dirs.add(dir)
  }
  for (const folder of folders) addFolder(folder)
  for (const [path, text] of Object.entries(files)) {
    addFolder(parentOf(path))
    store.set(path, text)
  }

  const missing = (path: string) => new Error(`ENOENT: no such file or directory, '${path}'`)
  const readPath = async (path: string) => {
    const text = store.get(path)
    if (text === undefined) throw missing(path)
    return text
  }
  const writePath = async (path: string, text: string) => {
    if (!dirs.has(parentOf(path))) throw missing(parentOf(path))
    store.set(path, text)
  }
  const tfile = (path: string) => ({ path }) as TFile
  const hidden = (path: string) => path.split('/').some((part) => part.startsWith('.'))

  return {
    files: store,
    folders: dirs,
    vault: {
      getFileByPath: (path) => store.has(path) && !hidden(path) ? tfile(path) : null,
      read: (file) => readPath(file.path),
      modify: (file, text) => writePath(file.path, text),
      async create(path, text) {
        if (store.has(path) || dirs.has(path)) throw new Error('File already exists.')
        await writePath(path, text)
        return tfile(path)
      },
      async process(file, fn) {
        const next = fn(await readPath(file.path))
        await writePath(file.path, next)
        return next
      },
      adapter: {
        async list(path) {
          const dir = path === '/' ? '' : path
          if (!dirs.has(dir)) throw missing(path)
          const inDir = (p: string) => p !== '' && parentOf(p) === dir
          return { files: [...store.keys()].filter(inDir).sort(), folders: [...dirs].filter(inDir).sort() }
        },
        read: readPath,
        write: writePath,
        exists: async (path) => store.has(path) || dirs.has(path),
        async process(path, fn) {
          const next = fn(await readPath(path))
          await writePath(path, next)
          return next
        },
        async rename(from, to) {
          const text = await readPath(from)
          if (!dirs.has(parentOf(to))) throw missing(parentOf(to))
          store.delete(from)
          store.set(to, text)
        },
        async mkdir(path) {
          addFolder(path)
        },
      },
    },
  }
}
