/**
 * `wi note` — add one progress line to a card's Notes.
 *
 * A dispatcher and its worker both report on the same card. A read-modify-write with a file tool
 * can lose one of two writes that land together; this goes through the locked `editItem`, which
 * re-reads the file, so both lines survive.
 */
import { editItem } from '../../shared/edit-item.ts'
import { appendNote, noteLine } from '../../shared/notes.ts'
import { authorLabel } from '../../shared/authorship.ts'
import type { Vault, WorkItem } from '../../shared/vault.ts'

export interface NoteAdded {
  item: WorkItem
  line: string
}

export interface NoteAuthor {
  /** The writer's name, from --agent or WI_AGENT. */
  agent?: string | undefined
  /** The model that writes the line, from WI_MODEL. */
  model?: string | undefined
}

/**
 * The line names its writer as "name (model)". It never uses card metadata as the writer's name.
 */
export async function addNote(
  vault: Vault,
  ref: string,
  text: string,
  author: NoteAuthor = {},
  now: Date = new Date(),
): Promise<NoteAdded> {
  const item = vault.resolve(ref)
  const who = authorLabel(author.agent, author.model)
  if (who === undefined) throw new Error('wi note needs a writer name. Set WI_AGENT or pass --agent.')
  const line = noteLine(text, who, now)
  await editItem(vault, item, [], (body) => appendNote(body, line))
  return { item, line }
}
