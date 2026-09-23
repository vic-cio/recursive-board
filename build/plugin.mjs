/**
 * Builds the three files decision D6 names: main.js, manifest.json, styles.css.
 * They land in dist/<plugin id>/, which a copy step puts into a vault.
 */
import { build, context } from 'esbuild'
import { mkdir, copyFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { forbiddenImports } from './forbidden-imports.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'src', 'plugin')
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))
const out = join(root, 'dist', manifest.id)

const watch = process.argv.includes('--watch')

await mkdir(out, { recursive: true })

const options = {
  entryPoints: [join(source, 'main.ts')],
  outfile: join(out, 'main.js'),
  bundle: true,
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  logLevel: 'info',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  treeShaking: true,
  // Obsidian provides its own API at runtime. Nothing else may be external, so the guard sees it.
  external: ['obsidian'],
  plugins: [forbiddenImports()],
}

const copyAssets = async () => {
  await copyFile(join(root, 'manifest.json'), join(out, 'manifest.json'))
  await copyFile(join(source, 'styles.css'), join(out, 'styles.css'))
}

if (watch) {
  const ctx = await context({ ...options, plugins: [...options.plugins, { name: 'assets', setup: (b) => b.onEnd(copyAssets) }] })
  await ctx.watch()
  console.log(`watching, output in dist/${manifest.id}/`)
} else {
  await build(options)
  await copyAssets()
  console.log(`built dist/${manifest.id}/`)
}
