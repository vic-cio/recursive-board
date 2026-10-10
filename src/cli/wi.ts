#!/usr/bin/env node
/**
 * `wi` — the only thing that writes into the vault.
 *
 * docs/adr/0004-wi-is-the-programmatic-write-interface.md: agents call this rather than editing Markdown with `sed`, so the integrity rules
 * live in tested code instead of in prose. That only holds if this is strictly better than `sed`,
 * which is why every command takes an id, a filename or a title, and why every error says what to
 * do next rather than only what went wrong.
 *
 * Exit codes: 0 fine, 1 the vault has errors, 2 the command could not run.
 */
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { findVaultRoot, getDefaultVault } from './vault.ts'
import { nodePort } from './node-port.ts'
import { createContext, isRegistered, runCommand, UsageError, type CommandLine } from '../shared/runner.ts'
import { RETIRED } from '../shared/commands/retired.ts'
import { runSetup } from './commands/setup.ts'
import { npmLatestVersion, renderDoctor, runDoctor } from './commands/doctor.ts'
import { realUpdateSeams, runUpdate } from './commands/update.ts'
import { packageRoot } from './package-files.ts'
import { parseCommandLine, type Values } from '../shared/command-line.ts'
import { COMMAND_FLAGS, renderHelp } from '../shared/command-table.ts'
import { versionLine } from '../shared/rules-version.ts'

const VERSION = '1.0.0'

async function main(argv: string[]): Promise<number> {
  // wi trace is not in the command table, so its old flags are not refused.
  if (argv[0] === 'trace') return serve(process.cwd(), { command: 'trace', positionals: ['trace'], values: {} })
  const { values, positionals } = parseCommandLine(argv)

  if (values.version) {
    process.stdout.write(`${versionLine(VERSION)}\n`)
    return 0
  }
  const [command, ...rest] = positionals
  if (values.help || command === undefined || command === 'help') {
    process.stdout.write(renderHelp())
    return command === undefined && !values.help ? 2 : 0
  }
  if (!(command in COMMAND_FLAGS)) throw new UsageError(`unknown command "${command}". Run wi --help.`)
  if (command === 'setup') {
    if (rest.length > 0) throw new UsageError('wi setup takes options only. Run wi setup --help for usage.')
    await runSetup({
      ...(typeof values['vault'] === 'string' ? { vault: values['vault'] } : {}),
      yes: values['yes'] === true,
      json: values['json'] === true,
      force: values['force'] === true,
    })
    return 0
  }
  if (command === 'update') {
    if (rest.length > 0) throw new UsageError('wi update takes options only. Run wi --help for usage.')
    return runUpdate({
      dryRun: values['dry-run'] === true,
      json: values.json === true,
      ...(typeof values['from'] === 'string' ? { from: values['from'] } : {}),
      ...(typeof values['vault'] === 'string' ? { vault: values['vault'] } : {}),
    }, realUpdateSeams(packageRoot(), VERSION))
  }

  if (command === 'doctor') {
    if (rest.length > 0) throw new UsageError('wi doctor takes options only. Run wi --help for usage.')
    const report = await runDoctor({
      version: VERSION,
      ...(typeof values['vault'] === 'string' ? { vaultFlag: values['vault'] } : {}),
      env: process.env,
      cwd: process.cwd(),
      home: homedir(),
      nodeVersion: process.versions.node,
      latestVersion: () => npmLatestVersion(process.env),
    })
    if (values.json === true) print(report)
    else process.stdout.write(renderDoctor(report))
    return report.broken ? 1 : 0
  }

  // A retired command reads no vault, so it runs outside one too.
  if (Object.hasOwn(RETIRED, command)) return serve(process.cwd(), { command, positionals, values })

  const root = await openRoot(text(values, 'vault'))
  if (!isRegistered(command)) throw new UsageError(`unknown command "${command}". Run wi --help.`)
  return serve(root, { command, positionals, values })
}

/** A string flag's value, or undefined when it was not given. */
function text(values: Values, key: string): string | undefined {
  const value = values[key]
  return typeof value === 'string' ? value : undefined
}

/** Runs a registered command on the Node port over `root`, and prints as it runs. */
async function serve(root: string, line: CommandLine): Promise<number> {
  const context = createContext({
    port: nodePort(root),
    version: VERSION,
    env: process.env,
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  })
  return (await runCommand(context, line)).code
}

async function openRoot(flag: string | undefined): Promise<string> {
  const root = await resolveVaultRoot(flag)
  if (findVaultRoot(root) !== root) {
    throw new UsageError(`${root} is not a vault: it has no Boards/ folder or board settings.`)
  }
  return root
}

async function resolveVaultRoot(flag: string | undefined): Promise<string> {
  const hint = flag ?? process.env['WI_VAULT']
  let root = hint ? resolve(hint) : findVaultRoot(process.cwd())
  if (root === null) {
    const configured = await getDefaultVault()
    root = configured ? resolve(configured) : null
  }
  if (root === null) {
    throw new UsageError(
      'no vault found. Pass --vault <path>, set WI_VAULT, run wi inside a vault, or set defaultVault with wi setup.',
    )
  }
  return root
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`wi: ${message}\n`)
  process.exitCode = 2
}
