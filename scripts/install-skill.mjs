/**
 * Makes the `vault` skill and the `wi` command available to every agent on this Mac.
 *
 * Each entry is a symlink back into this repo, so the skill and the CLI stay current without a
 * reinstall. None of them is inside iCloud, so the symlink rule of decision D6 does not apply.
 *
 *   ~/.agents/skills/vault  -> <repo>/skills/vault     (the .agents standard)
 *   ~/.claude/skills/vault  -> ../../.agents/skills/vault   (Claude Code reads this one)
 *   ~/.local/bin/wi             -> <repo>/src/cli/wi.ts
 *
 * Usage: node scripts/install-skill.mjs
 */
import { lstat, mkdir, readlink, symlink, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = homedir()

const LINKS = [
  { at: join(home, '.agents', 'skills', 'vault'), to: join(root, 'skills', 'vault') },
  { at: join(home, '.claude', 'skills', 'vault'), to: join('..', '..', '.agents', 'skills', 'vault') },
  { at: join(home, '.local', 'bin', 'wi'), to: join(root, 'src', 'cli', 'wi.ts') },
]

for (const { at, to } of LINKS) {
  await mkdir(dirname(at), { recursive: true })
  const existing = await lstat(at).catch(() => null)
  if (existing && !existing.isSymbolicLink()) {
    console.error(`refusing to replace ${at}: it is a real file or folder, not a link this script made.`)
    process.exit(2)
  }
  if (existing) {
    if (resolve(dirname(at), await readlink(at)) === resolve(dirname(at), to)) {
      console.log(`ok       ${at}`)
      continue
    }
    await unlink(at)
  }
  await symlink(to, at)
  console.log(`linked   ${at} -> ${to}`)
}
