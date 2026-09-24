import { parseFrontmatter, setKey } from '../shared/frontmatter.ts'
import { WORK_ITEM_TYPE } from '../shared/schema.ts'

type ObservedChange =
  | { kind: 'editor'; previous: string; current: string; stamp: string }
  | { kind: 'vault'; previous: string; current: string; stamp: string }

/** Stamp a changed editor document, leaving vault writes and unchanged text alone. */
export function stampObservedChange(change: ObservedChange): string {
  if (change.kind === 'vault' || change.previous === change.current) return change.current
  if (parseFrontmatter(change.current)?.get('type') !== WORK_ITEM_TYPE) return change.current
  return setKey(change.current, 'updated', change.stamp)
}

/** Replace only the changed span, preserving editor selection and undo history around the edit. */
export function replaceChangedSpan(
  editor: { offsetToPos(offset: number): { line: number; ch: number }; replaceRange(
    replacement: string,
    from: { line: number; ch: number },
    to?: { line: number; ch: number },
  ): void },
  before: string,
  after: string,
): void {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++

  let beforeEnd = before.length
  let afterEnd = after.length
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd--
    afterEnd--
  }

  editor.replaceRange(
    after.slice(start, afterEnd),
    editor.offsetToPos(start),
    editor.offsetToPos(beforeEnd),
  )
}
