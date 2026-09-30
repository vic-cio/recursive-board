/**
 * The CLI's disk writes.
 *
 * The edit rules themselves live in `shared/edits.ts` and `shared/transitions.ts`, so the plugin
 * applies the same ones. This module is only the part that touches a filesystem, which is exactly
 * the part the plugin must not carry to iOS.
 */
import { writeFile, rename, readFile, mkdir, rm, stat, chmod } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { applyEdits, withStamp, type Edit } from '../shared/edits.ts'
import type { WorkItem } from './vault.ts'

export { applyEdits, withStamp, type Edit }

/**
 * Writes through a temporary file in the same folder, then renames.
 * A rename is atomic on one filesystem, so a crash or a sync race cannot leave a half-written
 * work item. That matters more here than anywhere else: this is the canonical layer.
 */
export async function writeAtomic(path: string, text: string): Promise<void> {
  const temp = join(dirname(path), `.wi-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`)
  let mode: number | undefined
  try {
    mode = (await stat(path)).mode & 0o7777
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await writeFile(temp, text, 'utf8')
  if (mode !== undefined) await chmod(temp, mode)
  await rename(temp, path)
}

const LOCK_WAIT_MS = 5000
const LOCK_STALE_MS = 30000

/**
 * Runs `fn` while this machine's other `wi` processes wait to write the same file.
 * The lock is a directory in the OS temp folder, because `mkdir` is atomic and a lock file in the
 * work-item folder would trip the unaccounted-file guard. It cannot stop a sync client or a
 * person's editor; it stops two agents on one machine losing each other's write.
 */
export async function withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const lock = join(tmpdir(), `wi-lock-${createHash('sha1').update(path).digest('hex')}`)
  const deadline = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      await mkdir(lock)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => 0)
      if (age > LOCK_STALE_MS) {
        await rm(lock, { recursive: true, force: true })
        continue
      }
      if (Date.now() > deadline) {
        throw new Error(`another wi process is writing ${path}. Retry. If no wi runs, remove ${lock}.`)
      }
      await sleep(20)
    }
  }
  try {
    return await fn()
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

/**
 * Applies edits to one work item on disk. Returns the new text.
 * It re-reads the file under the lock, so an edit made since the vault was loaded survives: the
 * edits name keys and the body edit appends, so both apply cleanly to the newer text.
 * Stamps `updated` only when the frontmatter edits or the body edit change the file.
 */
export async function editItem(
  item: WorkItem,
  edits: readonly Edit[],
  editBody: (text: string) => string = (text) => text,
): Promise<string> {
  return withFileLock(item.path, async () => {
    const current = await readFile(item.path, 'utf8')
    if (editBody(applyEdits(current, edits)) === current) return current
    const text = editBody(applyEdits(current, withStamp(edits)))
    await writeAtomic(item.path, text)
    return text
  })
}
