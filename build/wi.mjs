/**
 * Builds `wi` to plain JavaScript, so it runs on Node 20 and later.
 *
 * The source is TypeScript with `.ts` import specifiers, which Node only runs from 23.6 with type
 * stripping. docs/adr/0010-plain-javascript-cli.md ships `wi` to users without a TypeScript toolchain, so the
 * CLI is bundled here instead. The output is one ESM file with a shebang, and its only imports are
 * `node:` builtins, which esbuild keeps external for `platform: 'node'`.
 *
 * The plugin is built separately (build/plugin.mjs) and must not share this bundle: it carries no
 * Node imports, and this one carries nothing else.
 * The source `src/cli/wi.ts` already carries a `#!/usr/bin/env node` shebang, and esbuild keeps
 * it at the top of the bundle, so this build adds no banner of its own.
 */
import { build } from 'esbuild'
import { chmod, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist', 'wi')
const file = join(out, 'wi.js')

await mkdir(out, { recursive: true })

await build({
  entryPoints: [join(root, 'src', 'cli', 'wi.ts')],
  outfile: file,
  bundle: true,
  format: 'esm',
  target: "node20.12",
  platform: 'node',
  logLevel: 'info',
  treeShaking: true,
})

await chmod(file, 0o755)
console.log('built dist/wi/wi.js')
