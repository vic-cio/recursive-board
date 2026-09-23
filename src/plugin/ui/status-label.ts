import type { Status } from '../../shared/schema.ts'

const labels = {
  backlog: 'Backlog',
  options: 'Options',
  doing: 'Doing',
  done: 'Done',
} satisfies Record<Status, string>

export function statusLabel(status: Status): string {
  return labels[status]
}
