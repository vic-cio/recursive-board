/**
 * `wi note` — add one progress line to a card's Notes.
 *
 * A dispatcher and its worker both report on the same card. A read-modify-write with a file tool
 * can lose one of two writes that land together; this goes through the locked `editItem`, which
 * re-reads the file, so both lines survive.
 */
import { editItem } from '../edit-item.ts'
import { appendNote, noteLine } from '../notes.ts'
import { authorLabel } from '../authorship.ts'
import type { Vault, WorkItem } from '../vault.ts'
import { UsageError, type RunFunction } from './command.ts'
import { envText, singleLineOption } from './options.ts'
import { json, label } from './output.ts'

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
  now: Date = vault.seams.now(),
): Promise<NoteAdded> {
  const item = vault.resolve(ref)
  const who = authorLabel(author.agent, author.model)
  if (who === undefined) throw new Error('wi note needs a writer name. Set WI_AGENT or pass --agent.')
  const line = noteLine(text, who, now)
  await editItem(vault, item, [], (body) => appendNote(body, line))
  return { item, line }
}

/** `wi note <ref> <text>`: signed by --agent or WI_AGENT, with WI_MODEL. */
export const runNote: RunFunction = async (context, line) => {
  const [ref, ...words] = line.positionals.slice(1)
  const text = words.join(' ').trim()
  if (ref === undefined || text === '') {
    throw new UsageError('wi note needs a <ref> and the text. Try: wi note wi-a7f3 "Priced 12 lines."')
  }
  const agent = line.values['agent'] === undefined ? undefined : singleLineOption(line.values, 'agent')
  const vault = await context.vault()
  const added = await addNote(vault, ref, text, { agent: agent ?? envText(context, 'WI_AGENT'), model: envText(context, 'WI_MODEL') })
  if (line.values['json'] === true) context.out(json({ id: added.item.id, path: added.item.relPath, line: added.line }))
  else context.out(`${label(added.item)}  ${added.line}\n`)
  return 0
}
