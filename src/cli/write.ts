/**
 * The CLI's disk writes.
 *
 * The edit rules themselves live in `shared/edits.ts` and `shared/transitions.ts`, so the plugin
 * applies the same ones. This module is only the part that touches a filesystem, which is exactly
 * the part the plugin must not carry to iOS.
 */
import { writeFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { applyEdits, withStamp, type Edit } from '../shared/edits.ts'
import type { WorkItem } from './vault.ts'

export { applyEdits, withStamp, type Edit }

/**
 * Writes through a temporary file in the same folder, then renames.
 * A rename is atomic on one filesystem, so a crash or a sync race cannot leave a half-written
 * work item. That matters more here than anywhere else: this is the canonical layer.
 */
export async function writeAtomic(path: string, text: string): Promise<void> {
  const temp = join(dirname(path), `.wi-${process.pid}-${Date.now()}.tmp`)
  await writeFile(temp, text, 'utf8')
  await rename(temp, path)
}

/**
 * Applies edits to one work item on disk. Returns the new text.
 * Stamps `updated` only when the frontmatter edits or the body edit change the file.
 */
export async function editItem(
  item: WorkItem,
  edits: readonly Edit[],
  editBody: (text: string) => string = (text) => text,
): Promise<string> {
  if (editBody(applyEdits(item.text, edits)) === item.text) return item.text
  const text = editBody(applyEdits(item.text, withStamp(edits)))
  await writeAtomic(item.path, text)
  return text
}
