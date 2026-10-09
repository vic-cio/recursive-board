/**
 * The plugin CLI handler: `obsidian vault=<name> recursive-board cmd="<wi command line>"`
 * (docs/adr/0078-one-plugin-cli-handler.md).
 *
 * Obsidian drops every argument that starts with `--`, so the whole wi command line travels in
 * the one `cmd` value. The handler splits and parses it as wi does, and runs it through the
 * shared runner on the Obsidian port. The Obsidian CLI exits 0 whatever a handler returns, so
 * the first line of every reply is exactly `ok` when the command succeeded, else
 * `error: <reason>`. What wi prints to standard output follows unchanged, then what it prints to
 * standard error. This module imports only types from 'obsidian', so node --test can load it.
 */
import type { CliData, CliFlags, EventRef } from 'obsidian'

import { parseCommandLine, splitCommandLine } from '../shared/command-line.ts'
import { COMMAND_FLAGS, renderHelp } from '../shared/command-table.ts'
import { createContext, runCommand, RUNNERS, type Reply, type RunFunction } from '../shared/runner.ts'
import { versionLine } from '../shared/rules-version.ts'
import type { StoragePort } from '../shared/storage.ts'
import type { VaultSeams } from '../shared/vault.ts'
import { obsidianPort, type ObsidianStorage } from './obsidian-port.ts'
import { PLUGIN_RUNNERS } from './install-commands.ts'

/** Every command the handler serves: the shared vault commands and the plugin's install commands. */
export const SERVED: Readonly<Record<string, RunFunction>> = { ...RUNNERS, ...PLUGIN_RUNNERS }

export const CLI_COMMAND = 'recursive-board'

/** How long a command waits for the metadata cache's first `resolved` event after the layout is ready. */
const RESOLVE_WAIT_MS = 2000

export const CLI_FLAGS: CliFlags = {
  cmd: {
    value: '<wi command line>',
    description: `A whole wi command line, flags included, for example cmd="status wi-1 done". cmd=help lists the commands.`,
  },
  agent: { value: '<name>', description: 'The name that signs a claim or a note, as WI_AGENT does for wi.' },
  model: { value: '<name>', description: 'The model that signs a note, as WI_MODEL does for wi.' },
}

/** The part of the plugin the handler uses, so a test can supply a fake. */
export interface CliHost {
  app: ObsidianStorage & {
    workspace: { onLayoutReady(callback: () => unknown): void }
    metadataCache: { on(name: 'resolved', callback: () => unknown): EventRef; offref(ref: EventRef): void }
  }
  manifest: { version: string }
  /** Absent before Obsidian 1.12.2. */
  registerCliHandler?: (command: string, description: string, flags: CliFlags | null, handler: (params: CliData) => Promise<string>) => void
  registerEvent(ref: EventRef): void
}

/**
 * Registers the handler on the desktop app, when Obsidian has the CLI. The phone has none.
 * Returns the handler, or null when nothing was registered.
 */
export function registerCli(host: CliHost, isDesktopApp: boolean, seams?: VaultSeams): ((params: CliData) => Promise<string>) | null {
  if (!isDesktopApp || typeof host.registerCliHandler !== 'function') return null
  const ready = whenReady(host)
  const port = obsidianPort(host.app)
  const handler = async (params: CliData) => {
    await ready
    return handleCli(params, { port, version: host.manifest.version, ...(seams ? { seams } : {}) })
  }
  host.registerCliHandler(CLI_COMMAND, 'Run a wi command line in this vault. The first reply line is ok or error: <reason>.', CLI_FLAGS, handler)
  return handler
}

/**
 * Resolves once the layout is ready and the metadata cache has resolved (spike wi-hopw, condition
 * 4). A plugin turned on after start-up may have missed the first `resolved` event, so the wait
 * after layout ready ends after two seconds with none.
 */
function whenReady(host: CliHost): Promise<void> {
  const cache = host.app.metadataCache
  const resolved = new Promise<void>((resolve) => {
    const ref = cache.on('resolved', () => {
      cache.offref(ref)
      resolve()
    })
    host.registerEvent(ref)
  })
  return new Promise<void>((resolve) => host.app.workspace.onLayoutReady(resolve))
    .then(() => new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, RESOLVE_WAIT_MS)
      void resolved.then(() => {
        clearTimeout(timer)
        resolve()
      })
    }))
}

export interface CliDeps {
  port: StoragePort
  version: string
  /** Fixes the clock and the chance, for a test. */
  seams?: VaultSeams
}

/** Runs one call of the handler and returns its whole reply. It never throws. */
export async function handleCli(params: CliData, deps: CliDeps): Promise<string> {
  try {
    return await run(params, deps)
  } catch (error) {
    return errorLine(error instanceof Error ? error.message : String(error))
  }
}

async function run(params: CliData, deps: CliDeps): Promise<string> {
  const cmd = params['cmd']
  if (cmd === undefined || cmd === 'true' || cmd.trim() === '') {
    throw new Error('pass a wi command line as cmd, for example cmd="status wi-1 done". cmd=help lists the commands.')
  }
  const env = cliEnv(params)
  const line = parseCommandLine(splitCommandLine(cmd))
  const { command, values } = line
  if (values.version) return okReply(`${versionLine(deps.version)}\n`)
  if (values.help || command === undefined || command === 'help') return okReply(renderHelp())
  if (!(command in COMMAND_FLAGS) || !Object.hasOwn(SERVED, command)) throw new Error(`unknown command "${command}". Run cmd=help.`)
  if (values['vault'] !== undefined) {
    throw new Error('the plugin runs in the vault that obsidian opened. Pass vault=<name> to obsidian, not --vault in cmd.')
  }

  const context = createContext({ port: deps.port, version: deps.version, env, ...(deps.seams ? { seams: deps.seams } : {}) })
  return formatReply(command, await runCommand(context, line, SERVED))
}

/** The environment a command sees: agent= is WI_AGENT and model= is WI_MODEL, since the plugin has no process environment. */
export function cliEnv(params: CliData): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [param, variable] of [['agent', 'WI_AGENT'], ['model', 'WI_MODEL']] as const) {
    const value = params[param]
    if (value === undefined) continue
    if (value === 'true' || value.trim() === '') throw new Error(`${param} needs a value: ${param}=<name>.`)
    env[variable] = value
  }
  return env
}

/** Turns a wi reply into the handler's reply: the fixed first line, then stdout, then stderr. */
export function formatReply(command: string, reply: Reply): string {
  if (reply.code === 0) return okReply(reply.stdout + reply.stderr)
  // The runner writes the reason for a failure last on standard error, as "wi: <reason>", after
  // any warning. A command that exits 1 may write no reason, and its output says why.
  const lines = reply.stderr.split('\n')
  const last = lines.findLastIndex((text) => text.trim() !== '')
  const reason = last === -1 ? `wi ${command} exited ${reply.code}` : lines[last]!.replace(/^wi: /, '')
  const rest = last === -1 ? '' : lines.filter((_, index) => index !== last).join('\n')
  const body = reply.stdout + rest
  return body === '' ? errorLine(reason) : `${errorLine(reason)}\n${body}`
}

function okReply(body: string): string {
  return body === '' ? 'ok' : `ok\n${body}`
}

/** The first line of a failed reply. A reason never spans lines, so the first line holds all of it. */
function errorLine(reason: string): string {
  return `error: ${reason.replace(/\s*\n\s*/g, ' ').trim()}`
}
