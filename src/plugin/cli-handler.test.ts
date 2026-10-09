import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { CliData, CliFlags, EventRef } from 'obsidian'

import { renderHelp } from '../shared/command-table.ts'
import type { VaultSeams } from '../shared/vault.ts'
import { CLI_COMMAND, cliEnv, formatReply, handleCli, registerCli, type CliHost } from './cli-handler.ts'
import { fakeObsidian, type FakeObsidian } from './fake-obsidian.ts'
import { obsidianPort } from './obsidian-port.ts'

function card(fields: Record<string, string>): string {
  return `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\n\n`
}

/** Card titles that need each kind of quoting in a cmd value. */
const FILES: Record<string, string> = {
  'Boards/Main.md': card({ type: 'work-item', id: 'wi-0001', title: 'Main', board: 'true' }),
  'Boards/Two words.md': card({ type: 'work-item', id: 'wi-0002', title: 'Two words', status: 'backlog', parent: '"[[Main]]"' }),
  "Boards/Victor's card.md": card({ type: 'work-item', id: 'wi-0003', title: '"Victor\'s card"', status: 'backlog', parent: '"[[Main]]"' }),
  'Boards/Say hi.md': card({ type: 'work-item', id: 'wi-0004', title: '\'Say "hi"\'', status: 'backlog', parent: '"[[Main]]"' }),
}

function seams(): VaultSeams {
  return { now: () => new Date(2026, 9, 9, 10, 30), random: () => 0.5 }
}

function deps(app: FakeObsidian = fakeObsidian(FILES)) {
  return { app, deps: { port: obsidianPort(app), version: '1.2.3', seams: seams() } }
}

const firstLine = (reply: string) => reply.split('\n')[0]

test('a command that succeeds replies ok, then what wi prints', async () => {
  const { app, deps: d } = deps()
  const reply = await handleCli({ cmd: 'status wi-0002 doing' }, d)
  assert.equal(reply, 'ok\nwi-0002  Two words  backlog → doing\n')
  assert.match(app.files.get('Boards/Two words.md')!, /^status: doing$/m)
})

test('cmd parses quoted titles as a shell does: spaces, double quotes and an apostrophe', async () => {
  const lines: [string, string, string][] = [
    [`status 'Two words' options`, 'Boards/Two words.md', 'Two words'],
    [`status "Victor's card" options`, "Boards/Victor's card.md", "Victor's card"],
    [`status Victor\\'s\\ card doing`, "Boards/Victor's card.md", "Victor's card"],
    [`status 'Say "hi"' options`, 'Boards/Say hi.md', 'Say "hi"'],
    [`status "Say \\"hi\\"" doing`, 'Boards/Say hi.md', 'Say "hi"'],
  ]
  const { app, deps: d } = deps()
  for (const [cmd, path, title] of lines) {
    const reply = await handleCli({ cmd }, d)
    assert.equal(firstLine(reply), 'ok', `${cmd}\n${reply}`)
    assert.ok(reply.includes(`  ${title}  `), `${cmd}\n${reply}`)
    const status = /^status: (\w+)$/m.exec(app.files.get(path)!)?.[1]
    assert.equal(status, cmd.split(' ').at(-1), cmd)
  }
})

test('a refusal replies error: with the reason on the first line', async () => {
  const { app, deps: d } = deps()
  const before = new Map(app.files)
  assert.equal(await handleCli({ cmd: 'status Main doing' }, d),
    'error: Boards/Main.md is a root, and a root is not a card in anyone\'s column. It takes no status.')
  assert.equal(await handleCli({ cmd: 'status Nope done' }, d).then(firstLine), 'error: no work item matches "Nope". Try an id, a filename or a title.')
  assert.deepEqual(app.files, before)
})

test('an unknown flag, an unclosed quote and a missing cmd reply error:', async () => {
  const { deps: d } = deps()
  assert.match(await handleCli({ cmd: 'status wi-0002 done --owner Victor' }, d), /^error: wi status does not take --owner\./)
  assert.equal(await handleCli({ cmd: `status 'Two words done` }, d), `error: the command line has an unclosed ' quote`)
  assert.match(await handleCli({}, d), /^error: pass a wi command line as cmd/)
  assert.match(await handleCli({ cmd: 'true' }, d), /^error: pass a wi command line as cmd/)
  assert.match(await handleCli({ cmd: 'status wi-0002 done', agent: 'true' }, d), /^error: agent needs a value/)
})

test('a command that the registry does not serve yet replies error: and names it', async () => {
  const { deps: d } = deps()
  assert.equal(await handleCli({ cmd: 'setup' }, d), 'error: the plugin does not serve wi setup yet. Run it with wi.')
  assert.equal(await handleCli({ cmd: 'nope' }, d), 'error: unknown command "nope". Run cmd=help.')
})

test('--vault in cmd is refused, because obsidian chose the vault', async () => {
  const { app, deps: d } = deps()
  const before = new Map(app.files)
  assert.match(await handleCli({ cmd: 'status wi-0002 done --vault Other' }, d), /^error: the plugin runs in the vault that obsidian opened/)
  assert.deepEqual(app.files, before)
})

test('cmd=help, cmd=--help and --help after a command print the wi help', async () => {
  const { deps: d } = deps()
  for (const cmd of ['help', '--help', 'status --help']) {
    assert.equal(await handleCli({ cmd }, d), `ok\n${renderHelp()}`, cmd)
  }
  assert.equal(await handleCli({ cmd: '--version' }, d), 'ok\n1.2.3 (rules 1)\n')
})

test('a wi exit 1 replies error:, and the output follows', () => {
  assert.equal(formatReply('validate', { code: 1, stdout: 'error: Boards/X.md: parent does not resolve\n', stderr: '' }),
    'error: wi validate exited 1\nerror: Boards/X.md: parent does not resolve\n')
})

test('the reason is the last stderr line; warnings before it and stdout follow', () => {
  assert.equal(formatReply('claim', { code: 2, stdout: 'out\n', stderr: 'wi: warning: one\nwi: the real reason\n' }),
    'error: the real reason\nout\nwi: warning: one\n')
})

test('on success, stderr warnings follow stdout unchanged', () => {
  assert.equal(formatReply('new', { code: 0, stdout: 'wi-1  Boards/A.md\n', stderr: 'wi: warning: wi-1 has no objective.\n' }),
    'ok\nwi-1  Boards/A.md\nwi: warning: wi-1 has no objective.\n')
  assert.equal(formatReply('status', { code: 0, stdout: '', stderr: '' }), 'ok')
})

test('agent= and model= become WI_AGENT and WI_MODEL', () => {
  assert.deepEqual(cliEnv({ cmd: 'x', agent: 'sp-handler', model: 'claude-opus-5-5' }), { WI_AGENT: 'sp-handler', WI_MODEL: 'claude-opus-5-5' })
  assert.deepEqual(cliEnv({ cmd: 'x' }), {})
})

interface FakeHost extends CliHost {
  registered: { command: string; flags: CliFlags | null; handler: (params: CliData) => Promise<string> }[]
  layoutReady(): void
  resolve(): void
}

function fakeHost(withCli = true): FakeHost {
  const app = fakeObsidian(FILES)
  let layout: (() => unknown)[] | null = []
  let resolved: (() => unknown)[] = []
  const host: FakeHost = {
    registered: [],
    app: {
      ...app,
      workspace: { onLayoutReady: (callback) => { if (layout === null) callback(); else layout.push(callback) } },
      metadataCache: {
        on: (_name, callback) => { resolved.push(callback); return callback as unknown as EventRef },
        offref: (ref) => { resolved = resolved.filter((callback) => callback !== (ref as unknown)) },
      },
    },
    manifest: { version: '1.2.3' },
    registerEvent: () => {},
    layoutReady() { const waiting = layout ?? []; layout = null; for (const callback of waiting) callback() },
    resolve() { for (const callback of resolved) callback() },
  }
  if (withCli) host.registerCliHandler = (command, _description, flags, handler) => host.registered.push({ command, flags, handler })
  return host
}

test('the handler registers on the desktop app only, and only when Obsidian has the CLI', () => {
  assert.equal(registerCli(fakeHost(), false), null)
  assert.equal(registerCli(fakeHost(false), true), null)
  const host = fakeHost()
  assert.notEqual(registerCli(host, true), null)
  assert.equal(host.registered.length, 1)
  assert.equal(host.registered[0]!.command, CLI_COMMAND)
  assert.deepEqual(Object.keys(host.registered[0]!.flags ?? {}), ['cmd', 'agent', 'model'])
})

test('a command waits for the layout and the metadata cache before it runs', async () => {
  const host = fakeHost()
  const handler = registerCli(host, true, seams())!
  let reply: string | undefined
  const pending = handler({ cmd: 'status wi-0002 doing' }).then((text) => { reply = text })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(reply, undefined, 'ran before the layout was ready')
  host.layoutReady()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(reply, undefined, 'ran before the metadata cache resolved')
  host.resolve()
  await pending
  assert.equal(firstLine(reply!), 'ok')
})
