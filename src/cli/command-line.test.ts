/**
 * Differential tests for the Node-free command line in src/shared: the splitter against /bin/sh,
 * and the parser against `node:util` parseArgs, which wi used before (docs/adr/0077).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'

import {
  FlagError, parseArguments, parseCommandLine, splitCommandLine, type CommandLine, type Option, type Values,
} from '../shared/command-line.ts'
import { COMMAND_FLAGS, OPTIONS, renderHelp, type Flag } from '../shared/command-table.ts'

/** How /bin/sh splits the line, with globbing off. A line with `$` or a backtick quotes it in single quotes. */
function shellWords(line: string): string[] {
  const script = `set -f\nset -- ${line}\nfor a in "$@"; do printf '%s\\0' "$a"; done`
  const out = execFileSync('/bin/sh', ['-c', script], { encoding: 'utf8' })
  return out === '' ? [] : out.slice(0, -1).split('\0')
}

const LINES = [
  'new Build server --parent wi-1',
  `new 'Build server' --parent "Main board"`,
  `new "Victor's card" --status options`,
  `new 'Victor'\\''s card'`,
  `new 'It said "hi"' --json`,
  `new "say 'hi' and \\"bye\\""`,
  'new "a \\"quoted\\" word" --parent=wi-1',
  'new back\\ slash\\ title',
  `new '' --parent wi-1`,
  `new ""`,
  `new "" '' x`,
  `new pre'mid'"post" x`,
  'new   spaced\t\ttabs  ',
  '\tnew\ttabs\t',
  'new "tab\tinside"',
  'new "two\nlines"',
  `new 'two\nlines'`,
  'new one \\\ntwo',
  'new one\\\ntwo',
  'new "one \\\ntwo"',
  `new 'one \\\ntwo'`,
  `new 'a\\b' "c\\d" e\\\\f`,
  'new "\\a\\b\\\\c"',
  `new '\\'`,
  'new "\\\\"',
  'new \\"x\\" \\\'y\\\'',
  'new \\a\\b',
  `new '$HOME' '\`date\`' "\\$HOME" "\\\`date\\\`"`,
  `new '*' '?' '[a]' * ? [a]`,
  `new a~b x~ "~" '~' \\~`,
  `new --context 'first' --context "second" --tag role/coder`,
  'new -- --parent is a title',
  `new --objective='Ship it' --parent="Main board"`,
  `note wi-1 'It''s fine'`,
  `note wi-1 "A note: a, b; c (d) {e} <f>"`,
  `new 'é ü 日本 🚀' "naïve"`,
  'new #a comment',
  `new a#b '#c' "#d" \\#e x # f 'g`,
  'new x\t#y',
  '',
  '   ',
  '\t\n',
]

test('splitCommandLine splits each line as /bin/sh does', () => {
  for (const line of LINES) assert.deepEqual(splitCommandLine(line), shellWords(line), JSON.stringify(line))
})

test('splitCommandLine refuses an unclosed quote', () => {
  assert.throws(() => splitCommandLine(`new 'open`), /unclosed ' quote/)
  assert.throws(() => splitCommandLine('new "open'), /unclosed " quote/)
  assert.throws(() => splitCommandLine(`new "it's`), /unclosed " quote/)
  assert.throws(() => splitCommandLine(`new 'say "hi'"`), /unclosed " quote/)
  assert.throws(() => splitCommandLine('new "a\\"'), /unclosed " quote/)
})

test('splitCommandLine reads an unquoted newline as a space, where a shell would end the command', () => {
  assert.deepEqual(splitCommandLine('new a\nb --json'), ['new', 'a', 'b', '--json'])
  assert.deepEqual(splitCommandLine('new a # comment\nb'), ['new', 'a', 'b'])
})

test('splitCommandLine drops a trailing backslash, as /bin/sh does', () => {
  const out = execFileSync('/bin/sh', ['-c', `printf '%s\\0' new x\\`], { encoding: 'utf8' })
  assert.deepEqual(out.slice(0, -1).split('\0'), ['new', 'x'])
  assert.deepEqual(splitCommandLine('new x\\'), ['new', 'x'])
})

test('splitCommandLine expands no dollar, tilde, glob or backtick', () => {
  assert.deepEqual(splitCommandLine('new $HOME ~ ~/x * ? [a] `date` $(date) ${X}'),
    ['new', '$HOME', '~', '~/x', '*', '?', '[a]', '`date`', '$(date)', '${X}'])
})

type Outcome = { values: Values; positionals: string[] } | { error: string; code: string | undefined; message: string }

function outcome(run: () => { values: Values; positionals: string[] }): Outcome {
  try {
    const { values, positionals } = run()
    return { values: { ...values }, positionals }
  } catch (error) {
    const e = error as Error & { code?: string }
    return { error: e instanceof FlagError ? 'FlagError' : e instanceof TypeError ? 'TypeError' : 'Error', code: e.code, message: e.message }
  }
}

function schema(flags: Flag[]): Record<string, Option> {
  return Object.fromEntries(flags.map((flag) => [flag, OPTIONS[flag]]))
}

const ALL = Object.keys(OPTIONS) as Flag[]

/** Argument lists that exercise each flag of a set: valid, missing, ambiguous, inline, repeated. */
function argumentLists(flags: Flag[]): string[][] {
  const lists: string[][] = [
    [], ['x'], ['x', 'y'], ['--'], ['x', '--', '--json', '-h'], ['-'], ['x', '-'], ['--no-such-flag'], ['-x'], ['-hV'],
    ['-Vh', 'x'], ['-h=1'], ['-rh'], ['-hr'], ['-rx'], ['--=x'], ['---a'], ['--help=yes'], ['--__proto__'],
    ['--constructor'], ['--toString=1'], ['-'], ['--', '--'], ['x', '--undo'], ['x', '--dry-run'], ['--force'],
  ]
  for (const flag of ALL) {
    const option = OPTIONS[flag] as Option
    const other = flags.includes(flag) ? 'valid' : 'refused'
    lists.push([other, `--${flag}`])
    lists.push([`--${flag}`, 'value', 'x'])
    lists.push([`--${flag}=value`, 'x'])
    lists.push([`--${flag}=`, 'x'])
    lists.push([`--${flag}`, '-'])
    lists.push([`--${flag}`, '--json'])
    lists.push([`--${flag}`, '-r'])
    lists.push([`--${flag}`, '--'])
    lists.push([`--${flag}`, 'a', `--${flag}`, 'b'])
    lists.push([`--${flag}=a`, `--${flag}=b`])
    if (option.short) {
      lists.push([`-${option.short}`])
      lists.push([`-${option.short}`, 'x'])
      lists.push([`-${option.short}value`])
    }
  }
  return lists
}

/** A seeded generator, so a failure repeats. */
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

const VOCABULARY = ['x', 'Main', '-', '--', '-r', '-h', '-V', '-rh', '-x', '-rV', '-hz', '--json', '--json=1', '--parent',
  '--parent=', '--parent=Main', '--tag', '--tag=a', '--files', '--to', '--dry-run', '--recursive', '--off', '--undo',
  '--nope', '--status', 'doing', '--vault', '/tmp/v', '--force', '--yes', '--help', '--version', '-', '--=', '---']

function fuzzLists(count: number, seed: number): string[][] {
  const next = random(seed)
  const lists: string[][] = []
  for (let n = 0; n < count; n++) {
    const length = Math.floor(next() * 6)
    lists.push(Array.from({ length }, () => VOCABULARY[Math.floor(next() * VOCABULARY.length)]!))
  }
  return lists
}

test('parseArguments agrees with node:util parseArgs on every command\'s flag set, strict and loose', () => {
  const sets: [string, Flag[]][] = [
    ['every flag', ALL],
    ...Object.entries(COMMAND_FLAGS).map(([name, flags]): [string, Flag[]] => [name, [...flags, 'help', 'version']]),
  ]
  let compared = 0
  for (const [name, flags] of sets) {
    const options = schema(flags)
    for (const args of [...argumentLists(flags), ...fuzzLists(150, name.length * 7919 + flags.length)]) {
      for (const strict of [true, false]) {
        const expected = outcome(() => parseArgs({ args, options, strict, allowPositionals: true }) as {
          values: Values; positionals: string[]
        })
        const actual = outcome(() => parseArguments(args, options, strict))
        assert.deepEqual(actual, expected, `${name}, strict ${strict}: ${JSON.stringify(args)}`)
        compared++
      }
    }
  }
  assert.ok(compared > 10_000, `compared ${compared} argument lists`)
})

test('parseArguments returns a values object with no prototype, as parseArgs does', () => {
  const { values } = parseArguments(['--json'], schema(['json']), true)
  assert.equal(Object.getPrototypeOf(values), null)
})

/** wi's parser before it moved to src/shared, on node:util parseArgs. */
function nodeParseCommandLine(argv: string[]): CommandLine {
  const first = parseArgs({ args: argv, allowPositionals: true, strict: false, options: schema(ALL) })
  const command = first.positionals[0]
  if (command !== undefined && command !== 'help' && !(command in COMMAND_FLAGS)) {
    return { command, positionals: first.positionals, values: first.values as Values }
  }
  const flags = command !== undefined && command in COMMAND_FLAGS ? [...COMMAND_FLAGS[command]!, 'help', 'version'] as Flag[] : ALL
  try {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: schema(flags) })
    return { command, positionals, values: values as Values }
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code !== 'ERR_PARSE_ARGS_UNKNOWN_OPTION' || command === undefined || !(command in COMMAND_FLAGS)) throw error
    // The refusal text comes from the shared parser; the reference checks when wi refuses.
    throw new FlagError((error as Error).message)
  }
}

test('parseCommandLine agrees with the parseArgs version on every command, valid and refused', () => {
  const commands = [...Object.keys(COMMAND_FLAGS), 'help', 'nope', 'trace']
  let refused = 0
  for (const command of commands) {
    const lists = [...argumentLists(COMMAND_FLAGS[command] ?? ALL), ...fuzzLists(60, command.length * 104729)]
    for (const args of lists) {
      for (const argv of [[command, ...args], [...args, command], args]) {
        const expected = outcome(() => nodeParseCommandLine(argv))
        const actual = outcome(() => parseCommandLine(argv))
        const label = JSON.stringify(argv)
        if ('error' in expected && expected.error === 'FlagError') {
          refused++
          assert.ok('error' in actual && actual.error === 'FlagError', label)
          const given = /'(-[^']*)'/.exec(expected.message)![1]!
          const named = parseArgs({ args: argv, allowPositionals: true, strict: false, options: schema(ALL) }).positionals[0]
          assert.ok(actual.message.startsWith(`wi ${named} does not take ${given}.`), label)
        } else {
          assert.deepEqual(actual, expected, label)
        }
      }
    }
  }
  assert.ok(refused > 1000, `checked ${refused} refusals`)
})

test('the refusal names the flag and the commands that take it', () => {
  assert.throws(() => parseCommandLine(['archive', 'x', '--dry-run']),
    { name: 'Error', message: 'wi archive does not take --dry-run. --dry-run applies only to wi update and wi rm and wi retag. Run wi --help.' })
  assert.throws(() => parseCommandLine(['validate', '--force']),
    { message: 'wi validate does not take --force. --force applies only to wi setup. Run wi --help.' })
  assert.throws(() => parseCommandLine(['show', 'x', '--undo']),
    { message: 'wi show does not take --undo. --undo applies only to wi archive. Run wi --help.' })
  assert.throws(() => parseCommandLine(['show', 'x', '-r']),
    { message: 'wi show does not take -r. --recursive applies only to wi rm. Run wi --help.' })
  assert.throws(() => parseCommandLine(['show', 'x', '--parent=Main']),
    { message: 'wi show does not take --parent. --parent applies only to wi new and wi dashboard and wi ready. Run wi --help.' })
  assert.throws(() => parseCommandLine(['show', 'x', '--off']),
    { message: 'wi show does not take --off. Run wi --help.' })
  assert.throws(() => parseCommandLine(['show', 'x', '--json=1']),
    { message: "Option '--json' does not take an argument" })
})

test('a split line parses as the same words would from a shell', () => {
  assert.deepEqual(parseCommandLine(splitCommandLine(`new "Victor's card" --parent Main --context 'a b' --context=c`)), {
    command: 'new',
    positionals: ['new', "Victor's card"],
    values: Object.assign(Object.create(null), { parent: 'Main', context: ['a b', 'c'] }),
  })
})

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('./wi.ts', import.meta.url))
const EXPECTED_HELP = readFileSync(new URL('./wi-help.expected.txt', import.meta.url), 'utf8')

test('renderHelp gives the help wi printed before the command table, byte for byte', () => {
  assert.equal(renderHelp(), EXPECTED_HELP)
})

test('wi --help prints renderHelp()', async () => {
  const { stdout } = await run('node', [CLI, '--help'], { timeout: 20_000 })
  assert.equal(stdout, EXPECTED_HELP)
})
