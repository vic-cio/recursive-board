/**
 * `wi move` — move a work item to another board.
 *
 * `parent` is the field the whole model turns on, and this is the one command that changes it.
 * It touches exactly one file, the moved item: the old parent and the new parent hold no record
 * of their children, so neither is written. The item's own children follow it for free, because
 * they point at it by link.
 *
 * The rules are in `shared/transitions.ts`, so the plugin's "Move to…" does the same thing.
 */
import { editItem } from '../edit-item.ts'
import { parseFrontmatter } from '../frontmatter.ts'
import { parseWikilink } from '../schema.ts'
import { moveEdits, moveRefusal } from '../transitions.ts'
import { requireAccountedTree, type Vault, type WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { json, label } from './output.ts'

export interface MoveResult {
  item: WorkItem
  /** The old parent's wikilink target, or null when the item had none. */
  from: string | null
  to: WorkItem
  changed: boolean
}

/**
 * Moves run one at a time on this machine, under a lock for the whole vault, and the loop check
 * reads each parent from disk (docs/adr/0054-edits-from-the-file-at-write-time.md). Without both,
 * `wi move A --to B` and `wi move B --to A` at once each pass the check on a loaded copy, and the
 * two writes make a loop. A move made in Obsidian or on a synced device takes no such lock.
 */
export async function moveItem(vault: Vault, ref: string, targetRef: string): Promise<MoveResult> {
  const item = vault.resolve(ref)
  const target = vault.resolve(targetRef)
  requireAccountedTree(vault, `move ${item.title ?? item.stem}`)

  return vault.port.withLock(MOVE_LOCK, async () => {
    // Keyed by stem, lowercased: the key a wikilink resolves by.
    const key = (w: WorkItem) => w.stem.toLowerCase()
    const byKey = new Map(vault.items.map((w) => [key(w), w]))
    const parents = await parentsFromDisk(vault, target, key)
    const refusal = moveRefusal({
      item: key(item),
      target: key(target),
      isRoot: item.parentRaw === undefined,
      parentOf: (k) => {
        if (parents.has(k)) return parents.get(k) ?? null
        const parent = vault.resolveLink(byKey.get(k)?.parent ?? null)
        return parent ? key(parent) : null
      },
    })
    if (refusal !== null) {
      throw new Error(`cannot move ${item.title ?? item.stem} under ${target.title ?? target.stem}: ${refusal}`)
    }

    let from = item.parent
    let changed = false
    await editItem(vault, item, (text) => {
      from = parseWikilink(parseFrontmatter(text)?.get('parent'))
      const edits = moveEdits(from, target.stem)
      changed = edits !== null
      return edits
    })
    return { item, from, to: target, changed }
  })
}

/** The lock every `wi move` in a vault takes. A name, not a file: the Node port keeps its locks in the OS temp folder. */
const MOVE_LOCK = '.wi-move'

/** The parent of the target and of each ancestor, read from disk now. A loop stops where it repeats. */
async function parentsFromDisk(
  vault: Vault, start: WorkItem, key: (w: WorkItem) => string,
): Promise<Map<string, string | null>> {
  const parents = new Map<string, string | null>()
  for (let current: WorkItem | undefined = start; current && !parents.has(key(current));) {
    const text = await vault.port.read(current.relPath).catch(() => current!.text)
    const next = vault.resolveLink(parseWikilink(parseFrontmatter(text)?.get('parent')))
    parents.set(key(current), next ? key(next) : null)
    current = next
  }
  return parents
}

/** `wi move <ref> --to <ref>`: what it prints, from the move moveItem made. */
export const runMove: RunFunction = async (context, line) => {
  const vault = await context.vault()
  const ref = line.positionals.slice(1).join(' ').trim()
  const to = typeof line.values['to'] === 'string' ? line.values['to'] : ''
  if (ref === '' || to === '') {
    throw new UsageError('wi move needs a <ref> and --to <ref>. Try: wi move wi-a7f3 --to Main')
  }
  const result = await moveItem(vault, ref, to)
  if (line.values['json'] === true) {
    context.out(json({
      id: result.item.id,
      path: result.item.relPath,
      from: result.from,
      to: result.to.stem,
      changed: result.changed,
    }))
  } else if (!result.changed) {
    context.out(`${label(result.item)} is already under ${result.to.stem}. Nothing written.\n`)
  } else {
    context.out(`${label(result.item)}  ${result.from ?? '—'} → ${result.to.stem}\n`)
  }
  return 0
}
