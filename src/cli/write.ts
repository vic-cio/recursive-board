/**
 * The CLI's disk writes.
 *
 * The edit rules themselves live in `shared/edits.ts` and `shared/transitions.ts`, so the plugin
 * applies the same ones. This module is only the part that touches a filesystem, which is exactly
 * the part the plugin must not carry to iOS. `node-port.ts` puts it behind the storage port.
 */
import { writeFile, rename, readFile, rm, stat, link, chmod } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { applyEdits, withStamp, type Edit, type EditPlan } from '../shared/edits.ts'

export { applyEdits, withStamp, type Edit, type EditPlan }

function uniqueSuffix(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Writes through a temporary file in the same folder, then renames.
 * A rename is atomic on one filesystem, so a crash or a sync race cannot leave a half-written
 * work item. That matters more here than anywhere else: this is the canonical layer.
 */
export async function writeAtomic(path: string, text: string): Promise<void> {
  const temp = join(dirname(path), `.wi-${uniqueSuffix()}.tmp`)
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

/**
 * Creates a file that must not exist yet. It fails with EEXIST, and changes nothing, when the
 * path exists, even when another process created it a moment ago.
 * It writes a temporary file and hard-links it into place: a link never replaces a file, and the
 * new file appears whole. A filesystem without hard links gets an exclusive create instead.
 */
export async function writeNew(path: string, text: string): Promise<void> {
  const temp = join(dirname(path), `.wi-${uniqueSuffix()}.tmp`)
  await writeFile(temp, text, 'utf8')
  try {
    await link(temp, path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EPERM' && code !== 'ENOTSUP' && code !== 'ENOSYS') throw error
    await writeFile(path, text, { encoding: 'utf8', flag: 'wx' })
  } finally {
    await rm(temp, { force: true })
  }
}

const LOCK_WAIT_MS = 5000
const LOCK_STALE_MS = 30000

/** The lock file for a path. The lock lives in the OS temp folder, not beside the work item. */
export function lockPathFor(path: string): string {
  return join(tmpdir(), `wi-lock-${createHash('sha1').update(path).digest('hex')}`)
}

/** Test seams. `afterStaleCheck` runs after a process judges a lock stale and before it takes the lock over. */
export interface LockHooks {
  afterStaleCheck?: () => Promise<void>
}

/** What identifies a lock file between two looks at it. */
export interface LockStamp { ino: number; mtimeMs: number }

/**
 * True when two looks saw the same lock. The inode alone is not enough: Linux reuses a freed
 * inode at once, so a fresh lock can carry the stale one's number. A stale lock is over 30
 * seconds old and a fresh one is new, so the modification time tells them apart.
 */
export function isSameLock(judged: LockStamp, seen: LockStamp): boolean {
  return judged.ino === seen.ino && judged.mtimeMs === seen.mtimeMs
}

/**
 * Moves the lock at `lock` aside when it is still the one judged stale (`judged`), and removes it.
 * The rename is atomic, so only one process moves a given lock. A process that moved a fresh
 * lock instead, because another process took the stale one over first, links it back. A link
 * never replaces a file, so this cannot remove a third process's lock either.
 */
async function takeOver(lock: string, judged: LockStamp): Promise<void> {
  const aside = `${lock}.stale-${uniqueSuffix()}`
  try {
    await rename(lock, aside)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const moved = await stat(aside).catch(() => undefined)
  if (moved !== undefined && !isSameLock(judged, moved)) {
    // A directory is a live lock from wi 0.7.0 or earlier, and a directory cannot be linked.
    await (moved.isFile() ? link(aside, lock) : rename(aside, lock)).catch(() => undefined)
  }
  await rm(aside, { recursive: true, force: true })
}

/**
 * Releases the lock only when it still holds this process's token. A lock taken over as stale
 * belongs to its new holder, and removing it would let a third process in beside that holder.
 */
async function release(lock: string, token: string): Promise<void> {
  const aside = `${lock}.release-${uniqueSuffix()}`
  try {
    await rename(lock, aside)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const held = await readFile(aside, 'utf8').catch(() => '')
  if (held !== token) await link(aside, lock).catch(() => undefined)
  await rm(aside, { recursive: true, force: true })
}

/**
 * Runs `fn` while this machine's other `wi` processes wait to write the same file.
 * The lock is a file in the OS temp folder, created exclusively, because a lock file in the
 * work-item folder would trip the unaccounted-file guard. It holds a token unique to this call.
 * It cannot stop a sync client or a person's editor; it stops two agents on one machine losing
 * each other's write. A lock older than 30 seconds is stale, and one waiting process takes it
 * over atomically. The lock was a directory in wi 0.7.0 and earlier; an old one still excludes, and a stale
 * one is taken over the same way.
 */
export async function withFileLock<T>(path: string, fn: () => Promise<T>, hooks: LockHooks = {}): Promise<T> {
  const lock = lockPathFor(path)
  const token = `${uniqueSuffix()}\n`
  const deadline = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      await writeFile(lock, token, { encoding: 'utf8', flag: 'wx' })
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const found = await stat(lock).catch(() => undefined)
      if (found === undefined) continue
      if (Date.now() - found.mtimeMs > LOCK_STALE_MS) {
        await hooks.afterStaleCheck?.()
        await takeOver(lock, found)
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
    await release(lock, token)
  }
}
