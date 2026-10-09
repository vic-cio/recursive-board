/**
 * What a vault command is, so wi and the plugin run the same one
 * (docs/adr/0076-a-storage-port-and-a-command-runner.md).
 *
 * A command reads everything from its context: the storage port, the environment, the version,
 * the clock and the chance. It never reads `process`, so it runs in the plugin as in wi.
 */
import type { StoragePort } from '../storage.ts'
import type { Env, Vault, VaultSeams } from '../vault.ts'

/** Parsed flag values, as `src/cli/flags.ts` gives them. */
export type Values = Record<string, string | string[] | boolean | undefined>

/** A parsed command line. `positionals[0]` is the command name. */
export interface CommandLine {
  command: string | undefined
  positionals: string[]
  values: Values
}

/** A command line that cannot run as typed. wi exits 2 for it, as for any other error. */
export class UsageError extends Error {}

export interface CommandContext {
  port: StoragePort
  env: Env
  version: string
  seams: VaultSeams
  /** Writes to standard output. */
  out(text: string): void
  /** Writes to standard error. */
  err(text: string): void
  /** The vault index over the port. It is read once, on the first call. */
  vault(): Promise<Vault>
}

/** What a command run gives back: its exit code and everything it wrote. */
export interface Reply {
  code: number
  stdout: string
  stderr: string
}

/** Runs one command and returns its exit code. It throws to fail with exit 2. */
export type RunFunction = (context: CommandContext, line: CommandLine) => Promise<number>
