#!/usr/bin/env node
/** Node-only measurements of the board-open path and the two read-only CLI commands. */
import { readFile, readdir, rm } from 'node:fs/promises'
import { cpus, platform, release, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawn } from 'node:child_process'
import type { App, TFile } from 'obsidian'

import { parseFrontmatter } from '../src/shared/frontmatter.ts'
import { checklistMarkdown } from '../src/shared/checklist.ts'
import { WorkItemIndex, toColumns } from '../src/plugin/index.ts'
import { BENCH_ROOT, makeBenchVault } from './bench-fixture.ts'

const SIZES = [100, 1000, 5000]
const RUNS = 15
const WARMUPS = 2

interface RawFile { path: string; text: string }
interface CachedFile { file: TFile; frontmatter: Record<string, unknown> }
interface Stats { median: number; p95: number }

function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b)
  const percentile = (p: number) => {
    const at = (sorted.length - 1) * p
    const lower = Math.floor(at)
    const upper = Math.ceil(at)
    return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (at - lower)
  }
  return { median: percentile(0.5), p95: percentile(0.95) }
}

async function sample(work: () => void | Promise<void>): Promise<Stats> {
  const times: number[] = []
  for (let i = -WARMUPS; i < RUNS; i++) {
    const start = performance.now()
    await work()
    if (i >= 0) times.push(performance.now() - start)
  }
  return stats(times)
}

async function readAll(folder: string): Promise<RawFile[]> {
  const names = await readdir(folder)
  return Promise.all(names.filter((name) => name.endsWith('.md')).map(async (name) => ({
    path: `Boards/${name}`, text: await readFile(join(folder, name), 'utf8'),
  })))
}

function cache(raw: RawFile[]): CachedFile[] {
  return raw.map(({ path, text }) => {
    const parsed = parseFrontmatter(text)
    if (!parsed) throw new Error(`missing frontmatter: ${path}`)
    const frontmatter: Record<string, unknown> = {}
    for (const key of parsed.keys()) frontmatter[key] = parsed.get(key)
    // The shared parser intentionally skips YAML collections. Obsidian's metadata cache
    // supplies tags as an array, so reproduce that one field for the index adapter.
    const tags = /^tags: \[([^\]]+)\]$/m.exec(text)?.[1]
    if (tags) frontmatter['tags'] = tags.split(',').map((tag) => tag.trim())
    const basename = path.slice('Boards/'.length, -'.md'.length)
    const file = { path, basename, parent: { path: 'Boards' } } as TFile
    return { file, frontmatter }
  })
}

function parseAll(raw: RawFile[]): void {
  for (const { path, text } of raw) {
    if (!parseFrontmatter(text)) throw new Error(`missing frontmatter: ${path}`)
  }
}

function makeApp(cached: CachedFile[]): { app: App; root: TFile } {
  const byPath = new Map(cached.map(({ file, frontmatter }) => [file.path, { file, frontmatter }]))
  const byStem = new Map(cached.map(({ file }) => [file.basename.toLowerCase(), file]))
  // This narrow adapter is the only Obsidian stand-in. The index receives cached metadata
  // and filename-stem link resolution, as it does in the app. No Obsidian runtime is loaded.
  const app = {
    vault: { getMarkdownFiles: () => cached.map(({ file }) => file) },
    metadataCache: {
      getFileCache: (file: TFile) => byPath.get(file.path) ?? null,
      getFirstLinkpathDest: (link: string) => byStem.get(link.toLowerCase()) ?? null,
    },
  } as unknown as App
  const root = byStem.get(BENCH_ROOT.toLowerCase())
  if (!root) throw new Error('root missing from generated vault')
  return { app, root }
}

async function cli(vault: string, command: 'children' | 'validate'): Promise<void> {
  const args = command === 'children'
    ? ['src/cli/wi.ts', 'children', BENCH_ROOT, '--tree', '--vault', vault]
    : ['src/cli/wi.ts', 'validate', '--vault', vault]
  await new Promise<void>((done, fail) => {
    const child = spawn(process.execPath, args, { cwd: resolve('.'), stdio: ['ignore', 'ignore', 'pipe'] })
    let errorText = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { errorText += chunk })
    child.on('error', fail)
    child.on('close', (code) => code === 0 ? done() : fail(new Error(`${command} exited ${code}: ${errorText}`)))
  })
}

function format(value: Stats): string {
  return `${value.median.toFixed(2)} / ${value.p95.toFixed(2)}`
}

async function run(): Promise<void> {
  const cpu = cpus()[0]
  process.stdout.write(`Node ${process.version}; ${platform()} ${release()}; ${cpu?.model ?? 'unknown CPU'}; ${cpus().length} logical CPUs; ${(totalmem() / 2 ** 30).toFixed(1)} GiB RAM\n`)
  process.stdout.write(`${RUNS} measured runs, ${WARMUPS} warmups per step; milliseconds, median / interpolated p95\n`)
  process.stdout.write('| Cards | Read files | Parse frontmatter | Rebuild index/tree | Group root board | Checklist Markdown | wi children --tree | wi validate | Root children |\n')
  process.stdout.write('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n')
  for (const cards of SIZES) {
    const vault = await makeBenchVault(cards)
    try {
      const folder = join(vault, 'Boards')
      const raw = await readAll(folder)
      if (raw.length !== cards + 1) throw new Error(`wanted ${cards + 1} files, got ${raw.length}`)
      const read = await sample(async () => { await readAll(folder) })
      const parse = await sample(() => { parseAll(raw) })
      const cached = cache(raw)
      const { app, root } = makeApp(cached)
      const rebuild = await sample(() => {
        const index = new WorkItemIndex(app)
        if (!index.get(root)) throw new Error('root absent from index')
      })
      const index = new WorkItemIndex(app)
      const children = index.childrenOf(root)
      const group = await sample(() => { toColumns(children) })
      const markdown = await sample(() => {
        const result = checklistMarkdown(children.map((child) => ({
          title: child.title, path: child.file.path, done: child.status === 'done',
        })))
        if (result.length === 0) throw new Error('empty generated Markdown')
      })
      await cli(vault, 'children')
      await cli(vault, 'validate')
      const childrenCli = await sample(() => cli(vault, 'children'))
      const validateCli = await sample(() => cli(vault, 'validate'))
      process.stdout.write(`| ${cards} | ${format(read)} | ${format(parse)} | ${format(rebuild)} | ${format(group)} | ${format(markdown)} | ${format(childrenCli)} | ${format(validateCli)} | ${children.length} |\n`)
    } finally {
      await rm(vault, { recursive: true, force: true })
    }
  }
}

await run()
