/**
 * The command-line parser moved to src/shared, so the plugin parses a `wi` command line the same
 * way (docs/adr/0077-one-command-line-in-shared.md). This module keeps the old import path.
 */
export { COMMAND_FLAGS, OPTIONS } from '../shared/command-table.ts'
export { FlagError, parseCommandLine, type CommandLine, type Values } from '../shared/command-line.ts'
