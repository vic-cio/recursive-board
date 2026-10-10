/**
 * The retired commands. Each prints the new way and exits 0, so an old script still runs
 * (AGENTS.md, Release). None reads the vault, so wi runs them outside a vault too.
 */
import type { RunFunction } from './command.ts'

function retired(message: string): RunFunction {
  return async (context) => {
    context.out(`${message}\n`)
    return 0
  }
}

const REMOVED_IN_0_8 = 'wi retag and wi graph were removed in 0.8.0. The board tree shows each card\'s area.'

export const RETIRED: Readonly<Record<string, RunFunction>> = {
  trace: retired('wi trace was removed in 0.8.0. Use wi show <ref> --json to read a card\'s Knowledge links.'),
  // docs/adr/0059-find-the-vault-in-four-ways.md
  here: retired('wi here is retired. A project\'s AGENTS.md names its board; pass it to wi new as --parent.'),
  template: retired('wi template is retired. Use wi new --template to choose a template when you create a work item.'),
  objective: retired('wi objective is retired. Use wi show <ref> --json to read a card and its ancestor objectives.'),
  dashboard: retired('wi dashboard is retired. Use wi agents for the agent count and limit. ' +
    'A dashboard is a separate plugin; the README names an example.'),
  // docs/adr/0082-review-is-a-wait-on-a-person.md
  review: retired('wi review is retired. To ask a person to review a card, run wi depend <ref> --on <person>. ' +
    'The person sends the card back with wi depend <ref> --on <person> --off, or approves it with wi status <ref> done.'),
  approve: retired('wi approve is retired. To approve a card, run wi status <ref> done. That also clears its waits on people.'),
  'send-back': retired('wi send-back is retired. To send a card back, clear the wait on the person: ' +
    'wi depend <ref> --on <person> --off. The card stays in doing with its assignees.'),
  // docs/adr/0083-assign-and-several-holders.md
  delegate: retired('wi delegate is retired. Use wi assign <ref> --to <person|agent>. It adds an assignee, and a card can have several.'),
  retag: retired(REMOVED_IN_0_8),
  graph: retired(REMOVED_IN_0_8),
}
