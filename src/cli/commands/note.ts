/**
 * `wi note` — add one progress line to a card's Notes.
 *
 * A dispatcher and its worker both report on the same card. A read-modify-write with a file tool
 * can lose one of two writes that land together; this goes through the locked `editItem`, which
 * re-reads the file, so both lines survive.
 */
import { editItem } from '../write.ts'
import { appendNote, noteLine } from '../../shared/notes.ts'
import { authorLabel } from '../../shared/authorship.ts'
import type { Vault, WorkItem } from '../vault.ts'

export interface NoteAdded {
  item: WorkItem
  line: string
}

export interface NoteAuthor {
  /** An explicit name for the line, from --agent. */
  agent?: string | undefined
  /** WI_CREATOR: the person or role writing. */
  creator?: string | undefined
  /** WI_MODEL. */
  model?: string | undefined
}

/**
 * The line names its writer as "Role (model)" (docs/adr/0042-creator-and-role.md): --agent first,
 * then WI_CREATOR, then the card's role, then the agent that holds the card.
 */
export async function addNote(
  vault: Vault,
  ref: string,
  text: string,
  author: NoteAuthor = {},
  now: Date = new Date(),
): Promise<NoteAdded> {
  const item = vault.resolve(ref)
  const text_ = (key: string) => {
    const value = item.frontmatter.get(key)
    return typeof value === 'string' && value.trim() !== '' ? value : undefined
  }
  const who = author.agent ??
    authorLabel(author.creator ?? text_('role'), author.model) ??
    text_('agent')
  const line = noteLine(text, who, now)
  await editItem(item, [], (body) => appendNote(body, line))
  return { item, line }
}
