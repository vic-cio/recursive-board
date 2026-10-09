/**
 * Applies edits to one work item through the vault's storage port.
 *
 * The port re-reads the file under its lock, and the edits are computed from that text when
 * `plan` is a rule (docs/adr/0054-edits-from-the-file-at-write-time.md), so an edit made since
 * the vault was loaded survives. The body edit runs on the same text, after the plan.
 * It stamps `updated` only when the frontmatter edits or the body edit change the file.
 */
import { applyEdits, editsFor, withStamp, type EditPlan } from './edits.ts'
import { today } from './schema.ts'
import type { Vault, WorkItem } from './vault.ts'

/** Returns the card's new text, or its current text when nothing changed. */
export function editItem(
  vault: Vault,
  item: WorkItem,
  plan: EditPlan,
  editBody: (text: string) => string = (text) => text,
): Promise<string> {
  return vault.port.update(item.relPath, (current) => {
    const edits = editsFor(current, plan)
    const body = editBody(applyEdits(current, edits))
    if (body === current) return current
    return editBody(applyEdits(current, withStamp(edits, today(vault.seams.now()))))
  })
}
