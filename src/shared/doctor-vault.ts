/**
 * The vault checks of doctor, read through the storage port
 * (docs/adr/0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md).
 *
 * `wi doctor` runs them on the Node port and the plugin's doctor on the Obsidian port, so both
 * report a vault the same way. The checks themselves are the pure functions in doctor.ts.
 */
import { boardSettingsIn, parsePluginData, PLUGIN_DATA_FILE } from './board-settings.ts'
import { checkBase, isSetupNote, type CheckResult, type SetupNote } from './doctor.ts'
import { getList, parseFrontmatter } from './frontmatter.ts'
import { roleTags } from './role-tags.ts'
import { WORK_ITEM_TYPE } from './schema.ts'
import { readIfPresent, type StoragePort } from './storage.ts'
import { NOT_NOTES, type Vault } from './vault.ts'
import { validate } from './commands/validate.ts'

export async function boardSettingsCheck(port: StoragePort): Promise<CheckResult> {
  const base = checkBase('board-settings')
  const sync = 'wi and the plugin use the defaults. Change a setting in Settings > Recursive Board to save them. With Obsidian Sync, turn on Installed community plugins sync on each device.'
  const text = await readIfPresent(port, PLUGIN_DATA_FILE)
  if (text === null) return { ...base, level: 'note', message: `${PLUGIN_DATA_FILE} does not exist, so ${sync}` }
  try {
    const board = boardSettingsIn(parsePluginData(text))
    if (board === null) return { ...base, level: 'note', message: `${PLUGIN_DATA_FILE} has no board key, so ${sync}` }
    return { ...base, level: 'pass', message: `${PLUGIN_DATA_FILE} holds the board settings.` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ...base, level: 'fix', broken: true, message: `${reason} Each wi command that reads the vault fails. Close Obsidian, then repair the file.` }
  }
}

/** `run` is how the reader runs validate: `wi validate`, or `cmd=validate` on the plugin. */
export async function validateCheck(vault: Vault, run = 'wi validate'): Promise<CheckResult> {
  const base = checkBase('validate')
  const report = await validate(vault)
  const counts = `${report.itemCount} work items, ${report.errorCount} errors, ${report.warningCount} warnings.`
  if (report.errorCount > 0) return { ...base, level: 'fix', message: `${counts} Run ${run} to read them.`, paste: run }
  if (report.warningCount > 0) return { ...base, level: 'note', message: `${counts} Run ${run} to read them.`, paste: run }
  return { ...base, level: 'pass', message: counts }
}

/** Every note in the vault, with the text of each note the checks read. */
export async function readSetupNotes(port: StoragePort): Promise<SetupNote[]> {
  const paths = (await port.list('', NOT_NOTES)).filter((path) =>
    /\.md$/i.test(path) && !path.split('/').some((part) => NOT_NOTES.has(part)))
  const notes = await Promise.all(paths.map(async (path): Promise<SetupNote> => {
    const text = await port.read(path)
    const frontmatter = parseFrontmatter(text)
    const type = frontmatter?.get('type')
    const description = frontmatter?.get('description')
    const note: SetupNote = {
      path,
      ...(typeof type === 'string' ? { type } : {}),
      ...(typeof description === 'string' ? { description } : {}),
      tags: getList(text, 'tags') ?? [],
      workItem: type === WORK_ITEM_TYPE,
    }
    return isSetupNote(note) ? { ...note, text } : note
  }))
  return notes.sort((a, b) => a.path.localeCompare(b.path))
}

/** The role tags on cards that are not done and not archived. */
export function openRoleTags(vault: Vault): string[] {
  return vault.items
    .filter((item) => item.status !== 'done' && !vault.isArchived(item))
    .flatMap((item) => roleTags(getList(item.text, 'tags') ?? []))
}
