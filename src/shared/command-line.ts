/**
 * Reads a `wi` command line with no Node, so `wi` and the plugin's CLI handler parse it the same
 * way (docs/adr/0077-one-command-line-in-shared.md).
 *
 * The flags each command takes live in the command table. A command refuses every other flag, so
 * a flag it would ignore cannot look as if it worked: `wi archive --dry-run` once archived the card.
 */
import { COMMAND_FLAGS, OPTIONS, type Flag } from './command-table.ts'

export type Option = { type: 'string' | 'boolean'; multiple?: boolean; short?: string }

/** Every command takes these. */
const ALWAYS: Flag[] = ['help', 'version']

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

/** An argument list that strict parsing refuses. The code and message are those of `node:util` parseArgs. */
export class ParseArgsError extends TypeError {
  readonly code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' | 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE'

  constructor(code: ParseArgsError['code'], message: string) {
    super(message)
    this.code = code
  }
}

interface Token {
  name: string
  rawName: string
  value: string | undefined
  inlineValue: boolean
}

function longNameFor(short: string, options: Record<string, Option>): string {
  return Object.entries(options).find(([, option]) => option.short === short)?.[0] ?? short
}

function typeOf(name: string, options: Record<string, Option>): Option['type'] | undefined {
  return Object.hasOwn(options, name) ? options[name]!.type : undefined
}

/**
 * Parses arguments as `parseArgs` from `node:util` does with positionals allowed: `--flag value`,
 * `--flag=value`, short flags and groups such as `-rh`, a bare `--`, and repeated values. Strict
 * parsing throws where `parseArgs` throws, with the same code and message. Loose parsing keeps
 * an unknown flag. The differential test in src/cli holds the two together.
 */
export function parseArguments(args: readonly string[], options: Record<string, Option>, strict: boolean): {
  values: Values
  positionals: string[]
} {
  const values = Object.create(null) as Values
  const positionals: string[] = []
  const store = (token: Token): void => {
    if (strict) check(token, options)
    if (token.name === '__proto__') return
    const value = token.value ?? true
    if (Object.hasOwn(options, token.name) && options[token.name]!.multiple) {
      const list = values[token.name]
      if (list === undefined) values[token.name] = [value as string]
      else (list as (string | boolean)[]).push(value)
    } else {
      values[token.name] = value
    }
  }

  const remaining = [...args]
  while (remaining.length > 0) {
    const arg = remaining.shift()!
    const next = remaining[0]
    if (arg === '--') {
      positionals.push(...remaining)
      break
    }
    const short = arg.length >= 2 && arg[0] === '-' && arg[1] !== '-'
    if (short && arg.length === 2) {
      const name = longNameFor(arg[1]!, options)
      const value = typeOf(name, options) === 'string' && next !== undefined ? remaining.shift() : undefined
      store({ name, rawName: arg, value, inlineValue: false })
      continue
    }
    if (short) {
      const first = longNameFor(arg[1]!, options)
      if (typeOf(first, options) !== 'string') {
        // A group such as -rh: each letter is a flag, and a string flag inside takes the rest.
        const expanded: string[] = []
        for (let i = 1; i < arg.length; i++) {
          const name = longNameFor(arg[i]!, options)
          if (typeOf(name, options) !== 'string' || i === arg.length - 1) {
            expanded.push(`-${arg[i]}`)
          } else {
            expanded.push(`-${arg.slice(i)}`)
            break
          }
        }
        remaining.unshift(...expanded)
      } else {
        store({ name: first, rawName: `-${arg[1]}`, value: arg.slice(2), inlineValue: true })
      }
      continue
    }
    if (arg.length > 2 && arg.startsWith('--')) {
      if (!arg.includes('=', 3)) {
        const name = arg.slice(2)
        const value = typeOf(name, options) === 'string' && next !== undefined ? remaining.shift() : undefined
        store({ name, rawName: arg, value, inlineValue: false })
      } else {
        const equals = arg.indexOf('=')
        const name = arg.slice(2, equals)
        store({ name, rawName: `--${name}`, value: arg.slice(equals + 1), inlineValue: true })
      }
      continue
    }
    positionals.push(arg)
  }
  return { values, positionals }
}

function check(token: Token, options: Record<string, Option>): void {
  if (!Object.hasOwn(options, token.name)) {
    throw new ParseArgsError('ERR_PARSE_ARGS_UNKNOWN_OPTION', `Unknown option '${token.rawName}'. To specify a positional `
      + `argument starting with a '-', place it at the end of the command after '--', as in '-- ${JSON.stringify(token.rawName)}`)
  }
  const option = options[token.name]!
  const shown = `${option.short ? `-${option.short}, ` : ''}--${token.name}`
  if (option.type === 'string' && token.value === undefined) {
    throw new ParseArgsError('ERR_PARSE_ARGS_INVALID_OPTION_VALUE', `Option '${shown} <value>' argument missing`)
  }
  if (option.type === 'boolean' && token.value !== undefined) {
    throw new ParseArgsError('ERR_PARSE_ARGS_INVALID_OPTION_VALUE', `Option '${shown}' does not take an argument`)
  }
  if (!token.inlineValue && token.value !== undefined && token.value.length > 1 && token.value.startsWith('-')) {
    const long = token.rawName.startsWith('--')
    const example = long ? `'${token.rawName}=-XYZ'` : `'--${token.name}=-XYZ' or '${token.rawName}-XYZ'`
    throw new ParseArgsError('ERR_PARSE_ARGS_INVALID_OPTION_VALUE', `Option '${token.rawName}' argument is ambiguous.\n`
      + `Did you forget to specify the option argument for '${token.rawName}'?\n`
      + `To specify an option argument starting with a dash use ${example}.`)
  }
}

function schema(flags: Flag[]): Record<string, Option> {
  return Object.fromEntries(flags.map((flag) => [flag, OPTIONS[flag]]))
}

/**
 * Finds the command, then parses the arguments against that command's flags alone. No command,
 * or `help`, is parsed against every flag, so --help and --version still work.
 */
export function parseCommandLine(argv: string[]): CommandLine {
  const all = Object.keys(OPTIONS) as Flag[]
  const first = parseArguments(argv, schema(all), false)
  const command = first.positionals[0]
  // An unknown command is refused by name, so its flags do not matter.
  if (command !== undefined && command !== 'help' && !(command in COMMAND_FLAGS)) {
    return { command, positionals: first.positionals, values: first.values }
  }
  const flags = command !== undefined && command in COMMAND_FLAGS ? [...COMMAND_FLAGS[command]!, ...ALWAYS] : all
  try {
    const { values, positionals } = parseArguments(argv, schema(flags), true)
    return { command, positionals, values }
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

/**
 * Splits a command line into words as a POSIX shell does: single quotes, double quotes with their
 * backslash escapes, backslash escapes outside quotes, line continuations, and a `#` comment at
 * the start of a word. It expands nothing: `$`, `~`, globs and backticks stay as they are. An
 * unquoted newline separates words, where a shell would end the command. It throws on an
 * unclosed quote.
 */
export function splitCommandLine(line: string): string[] {
  const words: string[] = []
  let word = ''
  let inWord = false
  let quote: '"' | "'" | null = null
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (quote === "'") {
      if (char === "'") quote = null
      else word += char
      continue
    }
    if (quote === '"') {
      if (char === '"') {
        quote = null
      } else if (char === '\\' && i + 1 < line.length && '"\\$`\n'.includes(line[i + 1]!)) {
        i++
        if (line[i] !== '\n') word += line[i]
      } else {
        word += char
      }
      continue
    }
    if (char === ' ' || char === '\t' || char === '\n') {
      if (inWord) words.push(word)
      word = ''
      inWord = false
      continue
    }
    if (char === '\\' && line[i + 1] === '\n') {
      i++ // A line continuation joins two lines and makes no word.
      continue
    }
    if (char === '#' && !inWord) {
      // A comment runs to the end of the line.
      while (i + 1 < line.length && line[i + 1] !== '\n') i++
      continue
    }
    inWord = true
    if (char === "'" || char === '"') {
      quote = char
    } else if (char === '\\') {
      if (i + 1 < line.length) word += line[++i]
    } else {
      word += char
    }
  }
  if (quote !== null) throw new Error(`the command line has an unclosed ${quote} quote`)
  if (inWord) words.push(word)
  return words
}
