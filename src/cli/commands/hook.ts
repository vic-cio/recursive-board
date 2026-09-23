/** Git pre-commit hook management for the installed CLI. */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const HOOK_MARK = '# installed by scripts/vault-git.mjs'

interface GitHook { top: string; path: string }

export interface HookStatus {
  vault: string
  gitRepo: string | null
  preCommit: 'installed' | 'present, not ours' | 'not installed'
}

async function gitHook(vault: string): Promise<GitHook | null> {
  try {
    const top = (await run('git', ['-C', vault, 'rev-parse', '--show-toplevel'])).stdout.trim()
    const path = (await run('git', ['-C', vault, 'rev-parse', '--git-path', 'hooks/pre-commit'])).stdout.trim()
    return { top, path: resolve(vault, path) }
  } catch {
    return null
  }
}

function isOurHook(body: string): boolean {
  return body.split('\n').some((line) => line === HOOK_MARK || line === '# installed by wi hook')
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function hookBody(vault: string, entry: string): string {
  return `#!/bin/sh
${HOOK_MARK}
# Edits outside the plugin can leave a vault invalid. Validate before committing.
# To bypass validation: git commit --no-verify

exec ${shellQuote(process.execPath)} ${shellQuote(entry)} validate --vault ${shellQuote(vault)}
`
}

export async function hookStatus(vault: string): Promise<HookStatus> {
  const git = await gitHook(vault)
  if (!git) return { vault, gitRepo: null, preCommit: 'not installed' }
  const present = existsSync(git.path)
  const ours = present && isOurHook(await readFile(git.path, 'utf8'))
  return {
    vault,
    gitRepo: git.top,
    preCommit: ours ? 'installed' : present ? 'present, not ours' : 'not installed',
  }
}

export async function installHook(vault: string, entry: string, force: boolean): Promise<string> {
  const git = await gitHook(vault)
  if (!git) throw new Error(`${vault} is not inside a Git repository. Run: git -C ${shellQuote(vault)} init`)
  if (existsSync(git.path)) {
    const current = await readFile(git.path, 'utf8')
    if (!isOurHook(current) && !force) {
      throw new Error(`${git.path} already exists and is not ours. Read it, then pass --force to replace it.`)
    }
  }
  await mkdir(dirname(git.path), { recursive: true })
  await writeFile(git.path, hookBody(vault, entry), 'utf8')
  await chmod(git.path, 0o755)
  return git.path
}

export async function uninstallHook(vault: string): Promise<string | null> {
  const git = await gitHook(vault)
  if (!git || !existsSync(git.path) || !isOurHook(await readFile(git.path, 'utf8'))) return null
  await rm(git.path)
  return git.path
}
