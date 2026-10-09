import type { Status } from '../../shared/schema.ts'
import type { Column } from '../index.ts'

/** The archived cards of the shown tab. Showing archived cards adds each one to its own status tab only. */
export function tabArchivedCount(columns: Pick<Column, 'status' | 'archived'>[], shown: Status): number {
  return columns.find((column) => column.status === shown)?.archived.length ?? 0
}
