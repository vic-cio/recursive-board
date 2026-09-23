#!/usr/bin/env node
/**
 * Install the two things that make a vault's history real.
 *
 * `install-hook` puts `wi validate` in the vault repo's pre-commit hook. Decision D7 asked for
 * exactly this: the paths that corrupt a vault are outside the plugin, and a hook catches all of
 * them at the moment the damage would become permanent and while the diff is still visible.
 *
 * `install-timer` runs `scripts/autocommit.mjs` on a launchd interval. Decision D2 made vault
 * commits manual and Mac-only, which was a fine discipline while the maintainer was the only writer. With
 * agents deleting unreviewed, a manual commit is a safety net nobody pulls.
 *
 * The two are deliberately different about failure. The hook blocks a commit that would record an
 * invalid vault, because a person is there to read why. The timer commits regardless and records
 * the validation result in the message, because a broken vault is the state most worth having
 * history for.
 *
 * Usage:
 *   node scripts/vault-git.mjs status        --vault <path>
 *   node scripts/vault-git.mjs install-hook  --vault <path> [--force]
 *   node scripts/vault-git.mjs install-timer --vault <path> [--interval 900] [--push]
 *   node scripts/vault-git.mjs uninstall     --vault <path>
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, chmod, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const NODE = process.execPath

const args = process.argv.slice(2)
const command = args[0]
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : (args[i + 1] ?? true)
}

const die = (line, code = 2) => {
  process.stderr.write(`${line}\n`)
  process.exit(code)
}

const vaultArg = flag('--vault')
if (typeof vaultArg !== 'string') {
  die('usage: node scripts/vault-git.mjs <status|install-hook|install-timer|uninstall> --vault <path>')
}
const vault = resolve(vaultArg)
// The same definition `wi` uses: a vault is a folder holding Boards/.
if (!existsSync(join(vault, 'Boards'))) die(`${vault} is not a vault: it has no Boards/ folder.`)

async function topLevel() {
  try {
    return (await run('git', ['-C', vault, 'rev-parse', '--show-toplevel'])).stdout.trim()
  } catch {
    return null
  }
}

/** One label per vault, so two vaults can each have a timer. */
function label() {
  const slug = vault.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  return `com.vault.autocommit.${slug}`.slice(0, 200)
}

const plistPath = () => join(homedir(), 'Library', 'LaunchAgents', `${label()}.plist`)

const HOOK_MARK = '# installed by vault scripts/vault-git.mjs'

function hookBody() {
  return `#!/bin/sh
${HOOK_MARK}
#
# Decision D7. The paths that actually corrupt this vault are outside the plugin: a hand edit on
# the phone, an agent rewriting YAML, a sync layer resurrecting a stale copy. This catches all
# three at the moment the damage would become permanent, while the diff is still visible.
#
# To commit anyway, which is sometimes the right call:  git commit --no-verify

exec ${JSON.stringify(NODE)} ${JSON.stringify(join(repo, 'src', 'cli', 'wi.ts'))} validate --vault ${JSON.stringify(vault)}
`
}

function plistBody(interval, push) {
  const argv = [NODE, join(repo, 'scripts', 'autocommit.mjs'), '--vault', vault]
  if (push) argv.push('--push')
  // Outside the vault: a log is not vault content, and it would otherwise sync to the phone.
  const log = join(homedir(), 'Library', 'Logs', `${label()}.log`)
  const xml = argv.map((a) => `      <string>${a.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>${label()}</string>
    <key>ProgramArguments</key>
    <array>
${xml}
    </array>
    <key>StartInterval</key><integer>${interval}</integer>
    <key>RunAtLoad</key><false/>
    <key>StandardOutPath</key><string>${log}</string>
    <key>StandardErrorPath</key><string>${log}</string>
  </dict>
</plist>
`
}

switch (command) {
  case 'status': {
    const top = await topLevel()
    console.log(`vault        ${vault}`)
    console.log(`git repo     ${top ?? 'none — run git init in the vault'}`)
    if (top) {
      const hook = join(top, '.git', 'hooks', 'pre-commit')
      const installed = existsSync(hook) && (await readFile(hook, 'utf8')).includes(HOOK_MARK)
      console.log(`pre-commit   ${installed ? 'installed' : existsSync(hook) ? 'present, not ours' : 'not installed'}`)
    }
    const plist = plistPath()
    console.log(`timer plist  ${existsSync(plist) ? plist : 'not installed'}`)
    if (existsSync(plist)) {
      try {
        await run('launchctl', ['print', `gui/${process.getuid()}/${label()}`])
        console.log('timer        loaded')
      } catch {
        console.log('timer        not loaded')
      }
    }
    break
  }

  case 'install-hook': {
    const top = await topLevel()
    if (!top) die(`${vault} is not inside a Git repository. Run: git -C ${JSON.stringify(vault)} init`)
    const dir = join(top, '.git', 'hooks')
    const hook = join(dir, 'pre-commit')
    if (existsSync(hook)) {
      const current = await readFile(hook, 'utf8')
      if (!current.includes(HOOK_MARK) && !args.includes('--force')) {
        die(`${hook} already exists and is not ours. Read it, then pass --force to replace it.`)
      }
    }
    await mkdir(dir, { recursive: true })
    await writeFile(hook, hookBody(), 'utf8')
    await chmod(hook, 0o755)
    console.log(`installed ${hook}`)
    console.log('a commit that would record an invalid vault is now refused')
    console.log('bypass with: git commit --no-verify')

    // Say what the hook will do on the next commit. Installing one that silently blocks
    // everything, because the vault is already invalid, is a trap worth spending two seconds on.
    try {
      await run(NODE, [join(repo, 'src', 'cli', 'wi.ts'), 'validate', '--vault', vault])
      console.log('\nthe vault is valid, so this blocks nothing today')
    } catch (error) {
      console.log('\nheads up: the vault does NOT validate right now, so the next commit will be refused:')
      process.stdout.write(error?.stdout ?? '')
      console.log('fix those, or commit with --no-verify until you do')
    }
    break
  }

  case 'install-timer': {
    const interval = Number(flag('--interval') ?? 900)
    if (!Number.isFinite(interval) || interval < 60) die('--interval must be at least 60 seconds')
    if (!(await topLevel())) die(`${vault} is not inside a Git repository. Run git init there first.`)

    const plist = plistPath()
    await mkdir(dirname(plist), { recursive: true })
    await writeFile(plist, plistBody(interval, args.includes('--push')), 'utf8')

    const target = `gui/${process.getuid()}`
    await run('launchctl', ['bootout', `${target}/${label()}`]).catch(() => {})
    await run('launchctl', ['bootstrap', target, plist])
    console.log(`installed ${plist}`)
    console.log(`committing every ${interval}s`)
    console.log(`log at ${join(homedir(), 'Library', 'Logs', `${label()}.log`)}`)
    break
  }

  case 'uninstall': {
    const top = await topLevel()
    if (top) {
      const hook = join(top, '.git', 'hooks', 'pre-commit')
      if (existsSync(hook) && (await readFile(hook, 'utf8')).includes(HOOK_MARK)) {
        await rm(hook)
        console.log(`removed ${hook}`)
      }
    }
    const plist = plistPath()
    if (existsSync(plist)) {
      await run('launchctl', ['bootout', `gui/${process.getuid()}/${label()}`]).catch(() => {})
      await rm(plist)
      console.log(`removed ${plist}`)
    }
    console.log('done')
    break
  }

  default:
    die(`unknown command ${command ?? '(none)'}. Try status, install-hook, install-timer, uninstall.`)
}
