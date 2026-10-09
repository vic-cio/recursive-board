/** The text forms every command prints the same way. */
import type { WorkItem } from '../vault.ts'

/** A card as one line prints it: its id, then its title. */
export function label(item: WorkItem): string {
  return `${item.id ?? '(no id)'}  ${item.title ?? item.stem}`
}

/** The --json output: the value, indented, and a newline. */
export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
