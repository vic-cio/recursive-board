#!/usr/bin/env node
/**
 * Install a validation hook in a vault Git repository.
 *
 * Edits outside the plugin can leave a vault invalid. Running `wi validate` before each commit
 * catches those errors while the changes are still available to fix.
 *
 * Usage:
 *   node scripts/vault-git.mjs status        --vault <path>
 *   node scripts/vault-git.mjs install-hook  --vault <path> [--force]
 *   node scripts/vault-git.mjs uninstall     --vault <path>
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, chmod, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
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
  die('usage: node scripts/vault-git.mjs <status|install-hook|uninstall> --vault <path>')
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

const HOOK_MARK = '# installed by scripts/vault-git.mjs'
const isOurHook = (body) => body.split('\n').some((line) =>
  line.startsWith('# installed by ') && line.endsWith('scripts/vault-git.mjs'))

function hookBody() {
  return `#!/bin/sh
${HOOK_MARK}
#
# Edits outside the plugin can leave a vault invalid. Validate before committing so errors can
# be fixed while the changes are still available.
#
# To bypass validation: git commit --no-verify

exec ${JSON.stringify(NODE)} ${JSON.stringify(join(repo, 'src', 'cli', 'wi.ts'))} validate --vault ${JSON.stringify(vault)}
`
}

switch (command) {
  case 'status': {
    const top = await topLevel()
    console.log(`vault        ${vault}`)
    console.log(`git repo     ${top ?? 'none — run git init in the vault'}`)
    if (top) {
      const hook = join(top, '.git', 'hooks', 'pre-commit')
      const installed = existsSync(hook) && isOurHook(await readFile(hook, 'utf8'))
      console.log(`pre-commit   ${installed ? 'installed' : existsSync(hook) ? 'present, not ours' : 'not installed'}`)
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
      if (!isOurHook(current) && !args.includes('--force')) {
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

  case 'uninstall': {
    const top = await topLevel()
    if (top) {
      const hook = join(top, '.git', 'hooks', 'pre-commit')
      if (existsSync(hook) && isOurHook(await readFile(hook, 'utf8'))) {
        await rm(hook)
        console.log(`removed ${hook}`)
      }
    }
    console.log('done')
    break
  }

  default:
    die(`unknown command ${command ?? '(none)'}. Try status, install-hook, uninstall.`)
}
