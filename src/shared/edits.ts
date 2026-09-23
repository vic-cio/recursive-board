/**
 * Frontmatter edits as data, so both writers apply the same rules.
 *
 * Integrity rule 5 says to change the one key you mean to change. An edit names a key, which is
 * why nothing here ever rebuilds a frontmatter block. This module imports nothing from Node, so
 * the plugin bundle can carry it to iOS.
 */
import { setKey, removeKey, type Scalar } from './frontmatter.ts'
import { today } from './schema.ts'

export type Edit =
  | { op: 'set'; key: string; value: Scalar }
  | { op: 'remove'; key: string }

export function applyEdits(text: string, edits: readonly Edit[]): string {
  let out = text
  for (const edit of edits) {
    out = edit.op === 'set' ? setKey(out, edit.key, edit.value) : removeKey(out, edit.key)
  }
  return out
}

/** Adds the `updated` stamp an edit implies, unless the caller already set it. */
export function withStamp(edits: readonly Edit[], stamp: string = today()): Edit[] {
  if (edits.some((e) => e.key === 'updated')) return [...edits]
  return [...edits, { op: 'set', key: 'updated', value: stamp }]
}
