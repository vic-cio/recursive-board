/**
 * The `wi` commands, once: each command's usage, flags, kind and help notes. `wi --help` and the
 * plugin's CLI handler print the same text from this table (docs/adr/0077-one-command-line-in-shared.md).
 */
import type { Option } from './command-line.ts'
import { STATUSES } from './schema.ts'

/** Every flag any command takes. The type decides whether the next word is the flag's value. */
export const OPTIONS = {
  parent: { type: 'string' },
  to: { type: 'string' },
  assignee: { type: 'string' },
  holder: { type: 'string' },
  role: { type: 'string' },
  tag: { type: 'string', multiple: true },
  on: { type: 'string' },
  status: { type: 'string' },
  owner: { type: 'string' },
  agent: { type: 'string' },
  reason: { type: 'string' },
  where: { type: 'string' },
  you: { type: 'string' },
  panel: { type: 'string', multiple: true },
  priority: { type: 'string' },
  template: { type: 'string' },
  objective: { type: 'string' },
  context: { type: 'string', multiple: true },
  criteria: { type: 'string', multiple: true },
  files: { type: 'string', multiple: true },
  note: { type: 'string' },
  comment: { type: 'string' },
  from: { type: 'string' },
  strict: { type: 'boolean' },
  vault: { type: 'string' },
  board: { type: 'string' },
  tree: { type: 'boolean' },
  archived: { type: 'boolean' },
  undo: { type: 'boolean' },
  off: { type: 'boolean' },
  recursive: { type: 'boolean', short: 'r' },
  'dry-run': { type: 'boolean' },
  json: { type: 'boolean' },
  force: { type: 'boolean' },
  yes: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'V' },
} satisfies Record<string, Option>

export type Flag = keyof typeof OPTIONS

/**
 * vault: reads or writes a vault. install: works on the wi install, the skill and the plugin
 * files. retired: changes nothing and names the new way.
 */
export type CommandKind = 'vault' | 'install' | 'retired'

export interface Command {
  name: string
  /** The usage lines, without the two-space indent. A retired command has none. */
  usage: string[]
  /** The flags it takes, besides --help and --version. */
  flags: Flag[]
  kind: CommandKind
  /** Whether it can write a file. */
  writes: boolean
  /** The help notes about this command, in the order the help prints them. */
  notes: string[]
}

type Entry = Omit<Command, 'notes'>

/** The commands, in the order the usage list prints them. */
const ENTRIES: Entry[] = [
  { name: 'setup', kind: 'install', writes: true, flags: ['vault', 'yes', 'force', 'json'],
    usage: ['wi setup [--yes] [--vault <path>] [--force] [--json]'] },
  { name: 'doctor', kind: 'install', writes: false, flags: ['vault', 'json'],
    usage: ['wi doctor [--json]'] },
  { name: 'update', kind: 'install', writes: true, flags: ['from', 'dry-run', 'vault', 'json'],
    usage: ['wi update [--dry-run] [--from <version>] [--vault <path>] [--json]'] },
  { name: 'new', kind: 'vault', writes: true,
    flags: ['parent', 'status', 'template', 'owner', 'assignee', 'holder', 'priority', 'objective', 'context', 'criteria',
      'tag', 'strict', 'vault', 'json'],
    usage: [
      'wi new <title> [--parent <ref>] [--status <s>] [--template <t>] [--owner <o>] [--assignee <a>]',
      '               [--priority <n>] [--objective <text>] [--context <text>]... [--criteria <text>]...',
      '               [--tag <tag>]... [--strict]',
    ] },
  { name: 'status', kind: 'vault', writes: true, flags: ['vault', 'json'], usage: ['wi status <ref> <status>'] },
  { name: 'note', kind: 'vault', writes: true, flags: ['agent', 'vault', 'json'],
    usage: ['wi note <ref> <text> [--agent <name>]'] },
  { name: 'area', kind: 'vault', writes: true, flags: ['off', 'vault', 'json'], usage: ['wi area <ref> [--off]'] },
  { name: 'tag', kind: 'vault', writes: true, flags: ['off', 'vault', 'json'], usage: ['wi tag <ref> <tag> [--off]'] },
  { name: 'depend', kind: 'vault', writes: true, flags: ['on', 'off', 'vault', 'json'],
    usage: ['wi depend <ref> --on <ref|person> [--off]'] },
  { name: 'set', kind: 'vault', writes: true, flags: ['owner', 'role', 'vault', 'json'],
    usage: ['wi set <ref> [--owner <name>] [--role ""]'] },
  { name: 'claim', kind: 'vault', writes: true, flags: ['assignee', 'holder', 'vault', 'json'],
    usage: ['wi claim <ref> [--assignee <name>]'] },
  { name: 'assign', kind: 'vault', writes: true, flags: ['to', 'role', 'off', 'vault', 'json'],
    usage: ['wi assign <ref> --to <person|agent> [--role <name>] [--off]'] },
  { name: 'delegate', kind: 'retired', writes: false, flags: ['to', 'role', 'vault', 'json'], usage: [] },
  { name: 'review', kind: 'retired', writes: false, flags: ['to', 'files', 'note', 'vault', 'json'], usage: [] },
  { name: 'approve', kind: 'retired', writes: false, flags: ['you', 'vault', 'json'], usage: [] },
  { name: 'send-back', kind: 'retired', writes: false, flags: ['you', 'comment', 'vault', 'json'], usage: [] },
  { name: 'objective', kind: 'retired', writes: false, flags: [], usage: [] },
  { name: 'agents', kind: 'vault', writes: false, flags: ['vault', 'json'], usage: ['wi agents [--json]'] },
  { name: 'dashboard', kind: 'retired', writes: false, flags: ['you', 'parent', 'panel', 'vault', 'json'], usage: [] },
  { name: 'release', kind: 'vault', writes: true, flags: ['reason', 'where', 'holder', 'vault', 'json'],
    usage: ['wi release <ref> --reason <text> [--where <branch-or-path>] [--holder <name>]'] },
  { name: 'move', kind: 'vault', writes: true, flags: ['to', 'vault', 'json'], usage: ['wi move <ref> --to <ref>'] },
  { name: 'archive', kind: 'vault', writes: true, flags: ['undo', 'vault', 'json'], usage: ['wi archive <ref> [--undo]'] },
  { name: 'promote', kind: 'vault', writes: true, flags: ['vault', 'json'], usage: ['wi promote <ref>'] },
  { name: 'demote', kind: 'vault', writes: true, flags: ['vault', 'json'], usage: ['wi demote <ref>'] },
  { name: 'rm', kind: 'vault', writes: true, flags: ['recursive', 'dry-run', 'vault', 'json'],
    usage: ['wi rm <ref> [--recursive] [--dry-run]'] },
  { name: 'children', kind: 'vault', writes: false, flags: ['status', 'tree', 'archived', 'vault', 'json'],
    usage: ['wi children [<ref>] [--status <s>] [--tree] [--archived]'] },
  { name: 'ready', kind: 'vault', writes: false, flags: ['parent', 'assignee', 'holder', 'vault', 'json'],
    usage: ['wi ready [--parent <ref>] [--assignee <name>] [--json]'] },
  { name: 'show', kind: 'vault', writes: false, flags: ['vault', 'json'], usage: ['wi show <ref> [--json]'] },
  { name: 'validate', kind: 'vault', writes: false, flags: ['vault', 'json'], usage: ['wi validate'] },
  { name: 'retag', kind: 'retired', writes: false, flags: ['dry-run', 'vault', 'json'], usage: [] },
  { name: 'graph', kind: 'retired', writes: false, flags: ['vault', 'json'], usage: [] },
  { name: 'template', kind: 'retired', writes: false, flags: ['vault', 'json'], usage: [] },
  { name: 'here', kind: 'retired', writes: false, flags: ['board', 'vault', 'json'], usage: [] },
]

/** The Options section of the help: each flag every command shares, or one that needs a word. */
const HELP_OPTIONS: [label: string, text: string][] = [
  ['--vault <path>', 'The vault root. Defaults to $WI_VAULT, the vault this folder is in, then defaultVault.'],
  ['--json', 'Machine-readable output.'],
  ['--force', 'Replace an unmanaged skill during setup.'],
  ['--yes', 'Run setup without prompts; requires --vault <path>.'],
  ['-h, --help', 'This text.'],
  ['-V, --version', 'Print the version and the rules version.'],
]

/**
 * The help notes, in the order the help prints them. A note names the commands it is about; one
 * about none is about every command or the vault. The notes are one list, not one per entry,
 * because the help groups them by topic, and a note can be about more than one command.
 */
const HELP_NOTES: { about: string[]; text: string }[] = [
  { about: ['retag', 'graph'], text: 'wi retag and wi graph were removed in 0.8.0. The board tree shows each card\'s area.' },
  { about: ['setup'], text: `\`wi setup\` copies the skill and saves a default vault. It writes nothing into the vault. --yes asks
no questions. --json prints one object and asks no questions; it needs --vault.` },
  { about: ['doctor'], text: `\`wi doctor\` checks the install and the vault. Each check prints pass, note or fix, and a fix
prints the command to run. It writes nothing. It exits 1 only when
the install is broken: Node is too old, the package is incomplete, the vault wi would use is
missing, or the plugin data cannot be read.` },
  { about: ['setup', 'doctor', 'update'], text: `On the plugin CLI, setup, doctor and update write nothing. setup prints what the plugin CLI
needs and the skill to save. doctor runs the vault checks and lists the install checks it skipped.
update prints the plugin and rules versions and where to update.` },
  { about: [], text: `Each command takes only the flags its usage line shows, plus --vault and --json where it reads a
vault or prints a result. It refuses any other flag with exit 2 and names the flag.` },
  { about: ['new'], text: `\`wi new\` writes the brief: --objective once, --context and --criteria once per paragraph or
criterion. It warns when the card has no Objective or Acceptance Criteria; --strict refuses it.` },
  { about: ['new', 'note'], text: `\`wi new\` and \`wi note\` wrap bare angle placeholders in backticks in Markdown body text. They
preserve code, links, autolinks, and HTML.` },
  { about: ['new'], text: `A title's unsafe filename characters become hyphens. When another item has the same filename,
the new file gets the id's suffix; wi never writes over a file.` },
  { about: ['new'], text: `\`wi new\` makes a parent a board when it gives the parent its first child. Set
"autoPromote": false in the board settings to turn this off. A root or an area is never changed.` },
  { about: ['new'], text: `\`wi new --tag <tag>\` adds a free tag; repeat it for more. A role is a tag such as role/checker:
a note that is not a work item and carries the same tag is that role's procedure. Roles do not
inherit. --assignee names who does the work. The legacy --holder means the same. --strict checks only the brief.` },
  { about: ['tag'], text: `\`wi tag <ref> <tag>\` adds a free tag to a card, and --off removes it. Case and a leading # do not
matter. It refuses old area/ tags, which remain on cards until the owner chooses a cleanup.` },
  { about: ['set'], text: `\`wi set\` changes a card's owner (an empty value removes it). --role "" removes an old role field;
a role is a tag.` },
  { about: ['note'], text: `\`wi note\` appends "- <date> <time>, <writer>: <text>" under Notes. It signs WI_AGENT or --agent,
and adds WI_MODEL when set. It refuses a note with no writer name. The write re-reads the card under a lock, so two notes at once both survive.` },
  { about: ['status'], text: '`wi status <ref> done` says when that was the parent\'s last open child. It does not close the parent.' },
  { about: ['status'], text: 'Unticking a done item is `wi status <ref> <its prev_status>`, which also clears the record.' },
  { about: ['validate'], text: `\`wi validate\` exits 1 when the vault has errors, so it works as a pre-commit hook. The README's
"Version the vault with Git" section has an optional hook snippet to copy.` },
  { about: [], text: `A hook that the removed \`wi hook install\` wrote keeps working; delete .git/hooks/pre-commit to
remove it.` },
  { about: ['template'], text: '`wi template` is retired. Use `wi new --template` to choose a template when you create a work item.' },
  { about: ['rm'], text: `\`wi rm\` moves a file to the vault's .trash. It refuses an item that has children
unless you pass --recursive, because removing a parent leaves its children on no board.` },
  { about: ['move'], text: '`wi move` changes only the item\'s parent. Its status stays, and its children follow it.' },
  { about: ['rm', 'move', 'archive'], text: `\`wi rm\`, \`wi move\` and \`wi archive\` refuse while a hidden non-Markdown file sits in the work-item
folder, because the index cannot read it and may be missing a work item. Let the sync
client download the file, or delete the stray file, then retry. There is no --force.` },
  { about: ['archive'], text: '`wi archive` changes one flag. Descendants disappear with their parent at read time.' },
  { about: ['area'], text: `\`wi area <ref>\` marks a card as an area and keeps its status. It refuses a card with an assignee.
Use \`wi area <ref> --off\` to convert back without changing its status.` },
  { about: ['depend', 'claim', 'status', 'children'], text: `\`wi depend <ref> --on <ref>\` makes a card wait on another card; --off removes that. \`--on <person>\`
makes it wait on a person (a note with type: person): that is how to ask for a review. \`wi claim\`
and \`wi status <ref> doing\` refuse a card with an open wait. \`wi children\` marks it [waits on N].
A person clears a wait with \`wi depend <ref> --on <person> --off\`: the card stays in doing with its
assignees. \`wi status <ref> done\` clears the card's waits on people: that is the approval.` },
  { about: ['status'], text: '`wi status <ref> done` names each card it unblocks. An archived card that is not done still blocks.' },
  { about: ['ready', 'claim', 'assign'], text: `A card's assignee field names the people and agents who do its work: one name, or a list.
An old card's holder or agent field is read as its assignees, in that order. The assignee value agent asks for any agent:
\`wi ready\` lists a card that only agent is assigned to, first, and a claim replaces agent with the
claimant's name. \`wi ready\` treats a card with any other assignee as taken.` },
  { about: ['claim'], text: `\`wi claim\` adds the claimant to the assignees and moves the card to doing. The claimant is
--assignee, else WI_AGENT. The legacy --holder means the same. It starts a card with no assignee, a card that agent is assigned to, or a card that
lists the claimant. A card assigned to others needs \`wi assign <ref> --to agent\` first. An agent may
share a card and its subtasks at once. A claim refuses a board with a child in doing that a
different agent or a person works.` },
  { about: ['release'], text: `\`wi release\` removes one assignee and adds a note. It removes --holder, else WI_AGENT when that
is assigned to the card, else the only assignee. The status stays while another named assignee remains;
otherwise the card moves to options.` },
  { about: ['assign'], text: `\`wi assign\` adds one assignee and nothing else: the status stays, and no note is written.
\`--to <person>\` names a person (a note with type: person). \`--to agent\` assigns any agent, which
asks any agent. wi starts no agent: start one with your harness's own tools, and it runs
\`wi claim\` by its own name. --off removes the name and leaves the status. --role <name> adds the
tag role/<name> to the card in the same write.` },
  { about: ['delegate'], text: '`wi delegate` is retired and changes nothing. Use `wi assign <ref> --to <person|agent>`.' },
  { about: ['show'], text: '`wi show` lists each role tag on the card with the notes that carry it: the procedure to follow.' },
  { about: ['objective'], text: '`wi objective` is retired. Use `wi show <ref> --json` to read a card and its ancestor objectives.' },
  { about: ['agents'], text: `\`wi agents\` prints the agents that count against maxAgents, each with the doing cards it works,
the count and the limit. Each agent on a doing card counts, so one card can use several places.
A person does not count. A card whose open children are all in doing, or that waits on a person,
does not count. The limit is none (null in
JSON) when no limit is set. It writes nothing.` },
  { about: ['dashboard'], text: `\`wi dashboard\` is retired and reads nothing. Use \`wi agents\` for the agent count and limit. A
dashboard is a separate plugin that reads the card files; the README names an example.` },
  { about: ['review', 'approve', 'send-back'], text: `\`wi review\`, \`wi approve\` and \`wi send-back\` are retired and change nothing. A review is a wait on a person:
\`wi depend <ref> --on <person>\` asks, \`wi depend <ref> --on <person> --off\` sends the card back, and
\`wi status <ref> done\` approves it.` },
  { about: [], text: `The board settings live in the Recursive Board plugin settings, stored in
.obsidian/plugins/recursive-board/data.json. wi reads them and never writes them.` },
  { about: ['new'], text: '`wi new` warns when a hidden file sits in the work-item folder, because a new id or filename may clash with it.' },
  { about: ['here'], text: '`wi here` is retired and changes nothing. A project\'s AGENTS.md names its board: pass it as --parent.' },
  { about: ['update'], text: `\`wi update\` installs the newest recursive-board with npm, then runs the new wi to refresh both skill
copies and the vault's plugin files, and prints the changelog's Agent setup changes. It leaves a
symlinked development copy alone, and does not create a missing plugin folder. --dry-run writes
nothing. --from <version> skips the install and names the old version.` },
  { about: [], text: '`wi trace` was removed in 0.8.0. Use `wi show <ref> --json` to read a card\'s Knowledge links.' },
]

/** Every command, in usage order. */
export const COMMANDS: readonly Command[] = ENTRIES.map((entry) => ({
  ...entry,
  notes: HELP_NOTES.filter((note) => note.about.includes(entry.name)).map((note) => note.text),
}))

/** The flags each command takes, besides --help and --version. */
export const COMMAND_FLAGS: Record<string, Flag[]> = Object.fromEntries(COMMANDS.map((command) => [command.name, command.flags]))

const indent = (lines: string[]): string => lines.map((line) => `  ${line}\n`).join('')

/** The text `wi --help` prints. */
export function renderHelp(): string {
  return 'wi — the Recursive Board CLI\n\n'
    + 'Usage\n'
    + indent(COMMANDS.flatMap((command) => command.usage))
    + '\n'
    + 'A <ref> is a work item id, a filename or a title. An id always wins.\n'
    + `A <status> is one of: ${STATUSES.join(', ')}.\n`
    + 'Options\n'
    + indent(HELP_OPTIONS.map(([label, text]) => `${label.padEnd(17)}${text}`))
    + '\n'
    + 'Notes\n'
    + indent(HELP_NOTES.flatMap((note) => note.text.split('\n')))
}
