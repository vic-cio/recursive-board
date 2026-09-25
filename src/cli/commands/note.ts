/**
 * `wi note` — add one progress line to a card's Notes.
 *
 * A dispatcher and its worker both report on the same card. A read-modify-write with a file tool
 * can lose one of two writes that land together; this goes through the locked `editItem`, which
 * re-reads the file, so both lines survive.
 */
import { editItem } from '../write.ts'
import { appendNote, noteLine } from '../../shared/notes.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface NoteAdded {
  item: WorkItem
  line: string
}

export async function addNote(
  vault: Vault,
  ref: string,
  text: string,
  agent?: string,
  now: Date = new Date(),
): Promise<NoteAdded> {
  const item = vault.resolve(ref)
  const held = item.frontmatter.get('agent')
  const who = agent ?? (typeof held === 'string' && held.trim() !== '' ? held : undefined)
  const line = noteLine(text, who, now)
  await editItem(item, [], (body) => appendNote(body, line))
  return { item, line }
}
