/**
 * Puts a built plugin into a vault.
 *
 * Decision D6, rule 1: do not symlink into the iCloud vault. iCloud does not sync a symlink, so
 * the phone would silently get nothing. This copies.
 *
 * Decision D6, rule 2: the local dev vault outside iCloud is the fast desktop loop, and there a
 * symlink is right, because `npm run dev` then updates the vault on every save.
 *
 * Usage:
 *   node build/install.mjs --vault <path>          copy the three files
 *   node build/install.mjs --vault <path> --link   symlink instead, refused inside iCloud
 */
import { copyFile, mkdir, readFile, rm, symlink, lstat, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'src', 'plugin', 'manifest.json'), 'utf8'))
const built = join(root, 'dist', manifest.id)

const FILES = ['main.js', 'manifest.json', 'styles.css']
/** How iCloud Drive appears on disk. A symlink placed under here never reaches the phone. */
const ICLOUD = join('Library', 'Documents')

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : (args[i + 1] ?? true)
}

const vaultArg = flag('--vault')
const link = args.includes('--link')

if (typeof vaultArg !== 'string') {
  console.error('usage: node build/install.mjs --vault <path> [--link]')
  process.exit(2)
}

const vault = resolve(vaultArg)
if (!existsSync(join(vault, '.obsidian'))) {
  console.error(`${vault} is not an Obsidian vault: it has no .obsidian folder.`)
  process.exit(2)
}
for (const file of FILES) {
  if (existsSync(join(built, file))) continue
  console.error(`dist/${manifest.id}/${file} is missing. Run npm run build first.`)
  process.exit(2)
}

const target = join(vault, '.obsidian', 'plugins', manifest.id)
const insideICloud = (await realpath(vault)).includes(`${sep}${ICLOUD}${sep}`)

if (link && insideICloud) {
  console.error(
    `refusing to symlink into ${vault}: it is inside iCloud Drive.\n` +
    'iCloud does not sync a symlink, so the phone would silently get nothing (decision D6).\n' +
    'Run without --link to copy.',
  )
  process.exit(2)
}

if (link) {
  const parent = dirname(target)
  await mkdir(parent, { recursive: true })
  if (existsSync(target) || (await lstat(target).catch(() => null))) {
    await rm(target, { recursive: true, force: true })
  }
  await symlink(built, target, 'dir')
  console.log(`linked ${target} -> dist/${manifest.id}/`)
  console.log('run `npm run dev` and the vault follows every save')
} else {
  await mkdir(target, { recursive: true })
  for (const file of FILES) await copyFile(join(built, file), join(target, file))
  console.log(`copied ${FILES.join(', ')} into ${target}`)
  if (insideICloud) console.log('iCloud will carry these to the phone')
}
console.log('enable it in Obsidian: Settings, Community plugins, Recursive Board')
