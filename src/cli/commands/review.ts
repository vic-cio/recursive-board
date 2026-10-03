/** The one shared send-for-review edit used by the CLI and the plugin. */
import { applyReviewRequest } from '../../shared/review.ts'
import { readPeople, type Vault, type WorkItem } from '../vault.ts'
import { editItem } from '../write.ts'

export interface ReviewRequest {
  item: WorkItem
  to: string
  files: string[]
}

export async function sendForReview(
  vault: Vault, ref: string, to: string, files: string[] = [], note = '', writer?: string, now: Date = new Date(),
): Promise<ReviewRequest> {
  const item = vault.resolve(ref)
  if (item.parent === null) throw new Error(`${item.relPath} is a root. A root cannot be sent for review.`)
  const name = to.trim()
  const person = (await readPeople(vault.root)).get(name.toLowerCase())
  if (person === undefined) throw new Error(`there is no person note called ${name}. Make a note with type: person.`)
  await editItem(item, [], (text) => applyReviewRequest(text, {
    to: person, files, note, now, ...(writer === undefined ? {} : { writer }),
  }))
  return { item, to: person, files: files.map((file) => file.trim()).filter((file) => file !== '') }
}
