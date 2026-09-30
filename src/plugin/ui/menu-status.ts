import { STATUSES, type Status } from '../../shared/schema.ts'

/** A root has no status. Child cards and areas use the same status choices. */
export function menuStatuses(meta: { parentLink: string | null; area: boolean }): Status[] {
  return meta.parentLink === null ? [] : [...STATUSES]
}
