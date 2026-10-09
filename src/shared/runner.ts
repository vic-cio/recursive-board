/**
 * The command runner: runs one vault command over a storage port and returns its reply
 * (docs/adr/0076-a-storage-port-and-a-command-runner.md).
 *
 * wi passes the Node port and writers that print as the command runs; the plugin passes the
 * Obsidian port and reads the reply. A usage error or a thrown error becomes exit 2 and
 * `wi: <message>` on standard error, as wi has always printed it.
 */
import { COMMANDS } from './commands/index.ts'
import { UsageError, type CommandContext, type CommandLine, type Reply } from './commands/command.ts'
import { loadVault, REAL_SEAMS, type Env, type Vault, type VaultSeams } from './vault.ts'
import type { StoragePort } from './storage.ts'

export { COMMANDS }
export { UsageError, type CommandContext, type CommandLine, type Reply, type RunFunction, type Values } from './commands/command.ts'

export interface ContextOptions {
  port: StoragePort
  version: string
  env?: Env
  /** Fixes the clock and the chance, for a test. */
  seams?: VaultSeams
  out?: (text: string) => void
  err?: (text: string) => void
}

export function createContext(options: ContextOptions): CommandContext {
  const seams = options.seams ?? REAL_SEAMS
  let loaded: Promise<Vault> | undefined
  return {
    port: options.port,
    env: options.env ?? {},
    version: options.version,
    seams,
    out: options.out ?? (() => {}),
    err: options.err ?? (() => {}),
    vault: () => (loaded ??= loadVault(options.port, seams)),
  }
}

/** True when the registry holds the command, so runCommand can run it. */
export function isRegistered(command: string | undefined): command is string {
  return command !== undefined && Object.hasOwn(COMMANDS, command)
}

/**
 * Runs the command the line names. The context's writers still see every write as it happens,
 * and the reply holds them all.
 */
export async function runCommand(context: CommandContext, line: CommandLine): Promise<Reply> {
  let stdout = ''
  let stderr = ''
  const run: CommandContext = {
    ...context,
    out: (text) => { stdout += text; context.out(text) },
    err: (text) => { stderr += text; context.err(text) },
  }
  let code: number
  try {
    if (!isRegistered(line.command)) throw new UsageError(`unknown command "${line.command ?? ''}". Run wi --help.`)
    code = await COMMANDS[line.command]!(run, line)
  } catch (error) {
    run.err(`wi: ${error instanceof Error ? error.message : String(error)}\n`)
    code = 2
  }
  return { code, stdout, stderr }
}
