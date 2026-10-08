/**
 * The flags each `wi` command takes. A command refuses every other flag, so a flag it would
 * ignore cannot look as if it worked: `wi archive --dry-run` once archived the card.
 */
import { parseArgs } from 'node:util'

type Option = { type: 'string' | 'boolean'; multiple?: boolean; short?: string }

/** Every flag any command takes. The type decides whether the next word is the flag's value. */
const OPTIONS = {
  parent: { type: 'string' },
  to: { type: 'string' },
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

type Flag = keyof typeof OPTIONS

/** Every command takes these. */
const ALWAYS: Flag[] = ['help', 'version']

/** The flags each command takes, besides --help and --version. */
export const COMMAND_FLAGS: Record<string, Flag[]> = {
  setup: ['vault', 'yes', 'force', 'json'],
  doctor: ['vault', 'json'],
  update: ['from', 'dry-run', 'vault', 'json'],
  new: ['parent', 'status', 'template', 'owner', 'holder', 'priority', 'objective', 'context', 'criteria',
    'tag', 'strict', 'vault', 'json'],
  status: ['vault', 'json'],
  note: ['agent', 'vault', 'json'],
  area: ['off', 'vault', 'json'],
  tag: ['off', 'vault', 'json'],
  depend: ['on', 'off', 'vault', 'json'],
  set: ['owner', 'role', 'vault', 'json'],
  claim: ['holder', 'vault', 'json'],
  delegate: ['to', 'role', 'vault', 'json'],
  review: ['to', 'files', 'note', 'vault', 'json'],
  approve: ['you', 'vault', 'json'],
  'send-back': ['you', 'comment', 'vault', 'json'],
  objective: [],
  agents: ['vault', 'json'],
  dashboard: ['you', 'parent', 'panel', 'vault', 'json'],
  release: ['reason', 'where', 'vault', 'json'],
  move: ['to', 'vault', 'json'],
  archive: ['undo', 'vault', 'json'],
  promote: ['vault', 'json'],
  demote: ['vault', 'json'],
  rm: ['recursive', 'dry-run', 'vault', 'json'],
  children: ['status', 'tree', 'archived', 'vault', 'json'],
  ready: ['parent', 'holder', 'vault', 'json'],
  show: ['vault', 'json'],
  validate: ['vault', 'json'],
  retag: ['dry-run', 'vault', 'json'],
  graph: ['vault', 'json'],
  template: ['vault', 'json'],
  here: ['board', 'vault', 'json'],
}

/** How the refusal names the commands that take a flag, where the command name alone is too broad. */
const TAKEN_BY: Partial<Record<Flag, string>> = {
  force: 'wi setup',
}

export type Values = Record<string, string | string[] | boolean | undefined>

export interface CommandLine {
  command: string | undefined
  positionals: string[]
  values: Values
}

export class FlagError extends Error {}

function schema(flags: Flag[]): Record<string, Option> {
  return Object.fromEntries(flags.map((flag) => [flag, OPTIONS[flag]]))
}

/**
 * Finds the command, then parses the arguments against that command's flags alone. No command,
 * or `help`, is parsed against every flag, so --help and --version still work.
 */
export function parseCommandLine(argv: string[]): CommandLine {
  const all = Object.keys(OPTIONS) as Flag[]
  const first = parseArgs({ args: argv, allowPositionals: true, strict: false, options: schema(all) })
  const command = first.positionals[0]
  // An unknown command is refused by name, so its flags do not matter.
  if (command !== undefined && command !== 'help' && !(command in COMMAND_FLAGS)) {
    return { command, positionals: first.positionals, values: first.values as Values }
  }
  const flags = command !== undefined && command in COMMAND_FLAGS ? [...COMMAND_FLAGS[command]!, ...ALWAYS] : all
  try {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: schema(flags) })
    // Strict parsing gives each flag its declared type, so a multiple flag holds strings only.
    return { command, positionals, values: values as Values }
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code !== 'ERR_PARSE_ARGS_UNKNOWN_OPTION' || command === undefined || !(command in COMMAND_FLAGS)) throw error
    throw new FlagError(refusal(command, (error as Error).message))
  }
}

function refusal(command: string, parseMessage: string): string {
  const given = /'(-[^']*)'/.exec(parseMessage)?.[1] ?? 'that flag'
  const long = given.startsWith('--')
    ? given.slice(2).split('=')[0]!
    : (Object.entries(OPTIONS) as [Flag, Option][]).find(([, option]) => `-${option.short}` === given)?.[0]
  let text = `wi ${command} does not take ${given}.`
  if (long !== undefined && long in OPTIONS) {
    const takers = Object.entries(COMMAND_FLAGS).filter(([, flags]) => flags.includes(long as Flag)).map(([name]) => `wi ${name}`)
    const taken = TAKEN_BY[long as Flag] ?? (takers.length <= 3 ? takers.join(' and ') : undefined)
    if (taken) text += ` --${long} applies only to ${taken}.`
  }
  return `${text} Run wi --help.`
}
