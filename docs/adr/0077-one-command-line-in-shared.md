---
status: accepted
---
# One command line in shared, and help from the command table

The plugin is to serve the vault commands through one Obsidian CLI handler, which takes a whole
`wi` command line in one value: `cmd="new 'Title' --parent wi-1"`. Obsidian drops every argument
that starts with `--`, so the flags must travel inside that value (spike wi-hopw). The plugin must
then split and parse the line as `wi` does. `src/cli/flags.ts` could not go in the plugin, because
it called `parseArgs` from `node:util`, and `src/shared/` imports nothing from Node.

## The decision

- **The parser lives in `src/shared/command-line.ts`, with no Node.** `parseArguments(args,
  options, strict)` follows `parseArgs` with positionals allowed: `--flag value`, `--flag=value`,
  short flags and groups such as `-rh`, a bare `--`, repeated values, and loose parsing that keeps
  an unknown flag. A strict refusal has the same code and the same message as `parseArgs`.
  `parseCommandLine`, `FlagError`, `CommandLine`, `Values` and the refusal text moved with it,
  under the same names and with the same behaviour. `src/cli/flags.ts` now only re-exports them.
- **`splitCommandLine(line)` splits a line as a POSIX shell does.** It reads single quotes, double
  quotes with their backslash escapes, backslashes, line continuations and a `#` comment at the
  start of a word. It expands nothing: `$`, `~`, globs and backticks stay as typed. An unclosed
  quote is an error. One difference from a shell: an unquoted newline separates two words, where
  a shell would end the command.
- **One command table, in `src/shared/command-table.ts`.** It holds `OPTIONS` and one entry for
  each command: its name, its usage lines, its flags, its kind (`vault`, `install` or `retired`),
  whether it writes, and its help notes. `COMMAND_FLAGS` is made from the table.
- **`renderHelp()` builds the help from the table**, and `wi --help` prints it. On the day of the
  change it gave the old help byte for byte; `src/cli/wi-help.expected.txt` holds those bytes and
  a test compares them. The plugin handler prints the same text.
- **The help notes are one ordered list, and each note names the commands it is about.** The help
  groups the notes by topic, and one note can be about several commands, so a list of notes per
  entry could not print the same text. Each entry's `notes` are the notes about it, in help order.
- **Differential tests hold the copies together.** `src/cli/command-line.test.ts` compares the
  splitter with `/bin/sh`, and the parser with `node:util` `parseArgs`, strict and loose, on every
  command's flag set: chosen argument lists for each flag, and a seeded random set.

## Rejected

- **Keep `parseArgs` in `wi` and a second parser in the plugin.** Two parsers drift, and the plugin
  and `wi` would read one line two ways.
- **A shell-words library.** It adds a dependency for 50 lines, and most expand `$` or `~`, which
  a `cmd=` value must not do.
- **Keep the help text as a constant beside the table.** The plugin needs the usage and the notes
  per command, and a copy of the text would drift from the table.
