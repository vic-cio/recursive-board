/**
 * `wi rm` — remove a work item.
 *
 * Agents may delete. That is a deliberate reversal of the original `AGENTS.md` caution, made on
 * 2026-09-22: agents are to own whole grandchild boards autonomously, the vault is version
 * tracked, and a CLI without the verb does not stop an agent deleting. It sends the agent to
 * `rm`, which is exactly what decision D5 exists to prevent.
 *
 * Two rules keep autonomy from becoming data loss.
 *
 * Removing a parent without `--recursive` is refused, because deleting a parent does not delete
 * its children: it leaves them pointing at a file that no longer exists. Integrity rule 4 forbids
 * repairing that silently, and decision u8 shows such an item renders on no board at all.
 *
 * Nothing is unlinked. A removed file moves to the vault's `.trash`, which is Obsidian's own
 * convention and is outside the five folders of decision D8, so it is never indexed again.
 */
import { mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { requireWholeTree, type Vault, type WorkItem } from '../vault.ts'

/** Obsidian's own local trash. Outside the five folders, so `wi validate` never sees it. */
export const TRASH = '.trash'

export interface RemoveOptions {
  /** Remove every descendant too. Required to remove anything that has children. */
  recursive?: boolean
  /** Report what would go and touch nothing. */
  dryRun?: boolean
}

export interface Removed {
  item: WorkItem
  /** Where the file went, relative to the vault root. */
  trashedTo: string
}

export interface RemoveResult {
  removed: Removed[]
  dryRun: boolean
}

/** The item and every descendant, deepest first, so a parent is never removed before its child. */
function subtree(vault: Vault, root: WorkItem): WorkItem[] {
  const ordered: WorkItem[] = []
  const seen = new Set<string>([root.relPath])

  const walk = (item: WorkItem): void => {
    for (const child of vault.childrenOf(item)) {
      if (seen.has(child.relPath)) continue // Integrity rule 3. A cycle must not loop forever.
      seen.add(child.relPath)
      walk(child)
    }
    ordered.push(item)
  }
  walk(root)
  return ordered
}

/** A free name in the trash. Removing twice must not overwrite the first copy. */
function trashPath(vault: Vault, item: WorkItem): string {
  const stem = item.stem
  for (let n = 0; n < 1000; n++) {
    const name = n === 0 ? `${stem}.md` : `${stem} ${n}.md`
    if (!existsSync(join(vault.root, TRASH, name))) return `${TRASH}/${name}`
  }
  return `${TRASH}/${stem} ${Date.now()}.md`
}

export async function removeItem(
  vault: Vault,
  ref: string,
  options: RemoveOptions = {},
): Promise<RemoveResult> {
  const { recursive = false, dryRun = false } = options
  const item = vault.resolve(ref)
  requireWholeTree(vault, `remove ${item.title ?? item.stem}`)

  if (item.parent === null) {
    throw new Error(
      `${item.relPath} is a root. Every board hangs off it, so it is not a card anyone can discard.`,
    )
  }

  const children = vault.childrenOf(item)
  if (children.length > 0 && !recursive) {
    const names = children.map((c) => `${c.id ?? '?'} ${c.title ?? c.stem}`).join(', ')
    throw new Error(
      `${item.title ?? item.stem} has ${children.length} children: ${names}. ` +
      'Removing it would leave them on no board. Move them first, or pass --recursive.',
    )
  }

  const doomed = recursive ? subtree(vault, item) : [item]
  const removed: Removed[] = []

  for (const target of doomed) {
    const trashedTo = trashPath(vault, target)
    if (!dryRun) {
      await mkdir(join(vault.root, TRASH), { recursive: true })
      await rename(target.path, join(vault.root, ...trashedTo.split('/')))
    }
    removed.push({ item: target, trashedTo })
  }

  return { removed, dryRun }
}
