import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { parseCommandLine } from '../flags.ts'
import { MANAGED_MARKER, MANAGED_TEXT } from './setup.ts'
import { runUpdate, type Npm, type UpdateReport, type UpdateSeams, type UpdateStep } from './update.ts'

const run = promisify(execFile)
const CLI = fileURLToPath(new URL('../wi.ts', import.meta.url))

const CHANGELOG = (version: string) => `# Changelog

## [Unreleased]

## [${version}] - 2026-10-08

### Agent setup

- Agents read the new playbook in ${version}.

### Added

- Something.

## [0.8.2] - 2026-10-04

### Agent setup

- Old news.
`

interface World {
  root: string
  home: string
  vault: string
  /** A package folder as npm installs it. */
  makePackage(name: string, version: string): string
  plugin: string
  skillCopies: string[]
  cleanup(): void
}

function world(): World {
  const root = mkdtempSync(join(tmpdir(), 'wi-update-'))
  const home = join(root, 'home')
  const vault = join(root, 'vault')
  mkdirSync(home)
  mkdirSync(join(vault, 'Boards'), { recursive: true })
  const write = (path: string, text: string) => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  return {
    root, home, vault,
    plugin: join(vault, '.obsidian', 'plugins', 'recursive-board'),
    skillCopies: [join(home, '.claude', 'skills', 'recursive-board'), join(home, '.agents', 'skills', 'recursive-board')],
    makePackage(name, version) {
      const pkg = join(root, name)
      write(join(pkg, 'package.json'), JSON.stringify({ name: 'recursive-board', version }))
      write(join(pkg, 'skills', 'recursive-board', 'SKILL.md'), `---\nname: recursive-board\n---\nskill ${version}\n`)
      write(join(pkg, 'dist', 'main.js'), `// plugin ${version}\n`)
      write(join(pkg, 'dist', 'manifest.json'), JSON.stringify({ id: 'recursive-board', version }))
      write(join(pkg, 'dist', 'styles.css'), `/* ${version} */\n`)
      write(join(pkg, 'dist', 'wi', 'wi.js'), '// wi\n')
      write(join(pkg, 'CHANGELOG.md'), CHANGELOG(version))
      return pkg
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

/** Installs the old package's skill copies and plugin, as wi setup and a manual install leave them. */
function installOld(w: World, oldPackage: string): void {
  for (const copy of w.skillCopies) {
    mkdirSync(copy, { recursive: true })
    writeFileSync(join(copy, 'SKILL.md'), readFileSync(join(oldPackage, 'skills', 'recursive-board', 'SKILL.md')))
    writeFileSync(join(copy, MANAGED_MARKER), MANAGED_TEXT)
  }
  mkdirSync(w.plugin, { recursive: true })
  for (const file of ['main.js', 'manifest.json', 'styles.css']) {
    writeFileSync(join(w.plugin, file), readFileSync(join(oldPackage, 'dist', file)))
  }
  writeFileSync(join(w.plugin, 'data.json'), '{"board":{}}\n')
}

interface Calls { latest: number; install: string[]; runWi: string[][] }

function seams(w: World, packageRoot: string, version: string, options: {
  latest?: string
  newPackage?: string
  calls?: Calls
  out?: string[]
} = {}): UpdateSeams {
  const calls = options.calls ?? { latest: 0, install: [], runWi: [] }
  const out = options.out ?? []
  const npm: Npm = {
    latestVersion: async () => {
      calls.latest++
      if (options.latest === undefined) throw new Error('npm must not be called')
      return options.latest
    },
    install: async (target) => { calls.install.push(target) },
    globalPackageRoot: async () => {
      if (!options.newPackage) throw new Error('no package was installed')
      return options.newPackage
    },
  }
  return {
    packageRoot, version, home: w.home, cwd: w.root,
    env: { WI_VAULT: w.vault, XDG_CONFIG_HOME: join(w.home, '.config') },
    npm,
    // The new wi, run in this process: the same code, with the new package as its root.
    runWi: async (_entry, args, capture) => {
      calls.runWi.push(args)
      const { values } = parseCommandLine(args)
      const childOut: string[] = []
      const newVersion = JSON.parse(readFileSync(join(options.newPackage!, 'package.json'), 'utf8')).version as string
      const code = await runUpdate({
        dryRun: values['dry-run'] === true,
        json: values['json'] === true,
        ...(typeof values['from'] === 'string' ? { from: values['from'] } : {}),
      }, { ...seams(w, options.newPackage!, newVersion, { calls, out: childOut }) })
      if (!capture) out.push(...childOut)
      return { code, stdout: childOut.join('') }
    },
    write: (text) => { out.push(text) },
  }
}

function stepOf<K extends UpdateStep['step']>(report: UpdateReport, name: K): Extract<UpdateStep, { step: K }> {
  const found = report.steps.find((step) => step.step === name)
  assert.ok(found, `the report has a ${name} step`)
  return found as Extract<UpdateStep, { step: K }>
}

test('a newer version installs, then the new wi refreshes the skill and the plugin from the new package', async () => {
  const w = world()
  try {
    const old = w.makePackage('old', '0.8.2')
    const fresh = w.makePackage('new', '0.9.0')
    installOld(w, old)
    const calls: Calls = { latest: 0, install: [], runWi: [] }
    const out: string[] = []
    const code = await runUpdate({ dryRun: false, json: false }, seams(w, old, '0.8.2', { latest: '0.9.0', newPackage: fresh, calls, out }))
    assert.equal(code, 0)
    assert.deepEqual(calls.install, ['0.9.0'])
    assert.deepEqual(calls.runWi, [['update', '--from', '0.8.2']])

    const text = out.join('')
    assert.match(text, /^wi update: installed recursive-board 0\.9\.0 \(was 0\.8\.2\)$/m)
    assert.match(text, /skill replaced at .*\.claude/)
    assert.match(text, /plugin replaced at .* \(0\.8\.2 → 0\.9\.0\)\. Reload Obsidian/)
    assert.match(text, /force-quit Obsidian/)
    assert.match(text, /Agent setup changes since 0\.8\.2:\n\n## 0\.9\.0\n\n- Agents read the new playbook in 0\.9\.0\./)
    assert.doesNotMatch(text, /Old news/)
    assert.match(text, /Run wi doctor/)

    for (const copy of w.skillCopies) assert.match(readFileSync(join(copy, 'SKILL.md'), 'utf8'), /skill 0\.9\.0/)
    assert.equal(readFileSync(join(w.plugin, 'main.js'), 'utf8'), '// plugin 0.9.0\n')
    assert.equal(readFileSync(join(w.plugin, 'data.json'), 'utf8'), '{"board":{}}\n', 'the settings stay')
  } finally {
    w.cleanup()
  }
})

test('--json merges the install step with the new wi report into one document', async () => {
  const w = world()
  try {
    const old = w.makePackage('old', '0.8.2')
    const fresh = w.makePackage('new', '0.9.0')
    installOld(w, old)
    const calls: Calls = { latest: 0, install: [], runWi: [] }
    const out: string[] = []
    const code = await runUpdate({ dryRun: false, json: true }, seams(w, old, '0.8.2', { latest: '0.9.0', newPackage: fresh, calls, out }))
    assert.equal(code, 0)
    assert.deepEqual(calls.runWi, [['update', '--from', '0.8.2', '--json']])
    assert.equal(out.length, 1)
    const report = JSON.parse(out[0]!) as UpdateReport
    assert.equal(report.from, '0.8.2')
    assert.equal(report.to, '0.9.0')
    assert.deepEqual(report.steps.map((step) => step.step), ['install', 'skill', 'plugin', 'changes'])
    assert.equal(stepOf(report, 'install').outcome, 'installed')
    assert.deepEqual(stepOf(report, 'skill').copies.map((copy) => copy.outcome), ['replaced', 'replaced'])
    assert.equal(stepOf(report, 'plugin').outcome, 'replaced')
    assert.deepEqual(stepOf(report, 'changes').changes, [{ version: '0.9.0', text: '- Agents read the new playbook in 0.9.0.' }])
    assert.equal(stepOf(report, 'changes').suggest, 'wi doctor')
  } finally {
    w.cleanup()
  }
})

test('a version that is already current installs nothing, and still refreshes the copies', async () => {
  const w = world()
  try {
    const old = w.makePackage('old', '0.8.2')
    installOld(w, old)
    // One skill copy drifted from the package; the plugin matches it.
    writeFileSync(join(w.skillCopies[1]!, 'SKILL.md'), 'edited\n')
    const calls: Calls = { latest: 0, install: [], runWi: [] }
    const out: string[] = []
    const code = await runUpdate({ dryRun: false, json: true }, seams(w, old, '0.8.2', { latest: '0.8.2', calls, out }))
    assert.equal(code, 0)
    assert.equal(calls.latest, 1)
    assert.deepEqual(calls.install, [])
    assert.deepEqual(calls.runWi, [])
    const report = JSON.parse(out.join('')) as UpdateReport
    assert.equal(stepOf(report, 'install').outcome, 'current')
    assert.match(stepOf(report, 'install').message, /0\.8\.2 is current\. Refreshing the skill and plugin copies/)
    assert.deepEqual(stepOf(report, 'skill').copies.map((copy) => copy.outcome), ['current', 'replaced'])
    assert.equal(stepOf(report, 'plugin').outcome, 'current')
    assert.deepEqual(stepOf(report, 'changes').changes, [])
    assert.match(readFileSync(join(w.skillCopies[1]!, 'SKILL.md'), 'utf8'), /skill 0\.8\.2/)
  } finally {
    w.cleanup()
  }
})

test('a symlinked development install of the skill and the plugin is left alone', async () => {
  const w = world()
  try {
    const old = w.makePackage('old', '0.8.2')
    const fresh = w.makePackage('new', '0.9.0')
    const dev = join(w.root, 'checkout')
    mkdirSync(join(dev, 'dist'), { recursive: true })
    mkdirSync(join(dev, 'skills', 'recursive-board'), { recursive: true })
    writeFileSync(join(dev, 'skills', 'recursive-board', 'SKILL.md'), 'dev skill\n')
    for (const copy of w.skillCopies) {
      mkdirSync(join(copy, '..'), { recursive: true })
      symlinkSync(join(dev, 'skills', 'recursive-board'), copy, 'dir')
    }
    mkdirSync(join(w.plugin, '..'), { recursive: true })
    symlinkSync(join(dev, 'dist'), w.plugin, 'dir')

    const out: string[] = []
    const code = await runUpdate({ dryRun: false, json: true }, seams(w, old, '0.8.2', { latest: '0.9.0', newPackage: fresh, out }))
    assert.equal(code, 0)
    const report = JSON.parse(out.join('')) as UpdateReport
    assert.deepEqual(stepOf(report, 'skill').copies.map((copy) => copy.outcome), ['dev-link', 'dev-link'])
    assert.equal(stepOf(report, 'plugin').outcome, 'dev-link')
    for (const copy of w.skillCopies) assert.ok(lstatSync(copy).isSymbolicLink())
    assert.ok(lstatSync(w.plugin).isSymbolicLink())
    assert.equal(readFileSync(join(dev, 'skills', 'recursive-board', 'SKILL.md'), 'utf8'), 'dev skill\n')
    assert.equal(existsSync(join(dev, 'dist', 'main.js')), false, 'nothing is copied through the link')
  } finally {
    w.cleanup()
  }
})

test('a plugin file that is a symlink also marks a development install', async () => {
  const w = world()
  try {
    const old = w.makePackage('old', '0.8.2')
    installOld(w, old)
    rmSync(join(w.plugin, 'main.js'))
    symlinkSync(join(old, 'dist', 'main.js'), join(w.plugin, 'main.js'))
    const fresh = w.makePackage('new', '0.9.0')
    const out: string[] = []
    await runUpdate({ dryRun: false, json: true, from: '0.8.2' }, seams(w, fresh, '0.9.0', { out }))
    assert.equal(stepOf(JSON.parse(out.join('')) as UpdateReport, 'plugin').outcome, 'dev-link')
    assert.equal(readFileSync(join(w.plugin, 'styles.css'), 'utf8'), '/* 0.8.2 */\n')
  } finally {
    w.cleanup()
  }
})

test('wi running from a source checkout skips npm and the plugin copy', async () => {
  const w = world()
  try {
    const checkout = w.makePackage('checkout', '0.8.2')
    mkdirSync(join(checkout, '.git'))
    installOld(w, w.makePackage('old', '0.8.1'))
    const calls: Calls = { latest: 0, install: [], runWi: [] }
    const out: string[] = []
    const code = await runUpdate({ dryRun: false, json: true }, seams(w, checkout, '0.8.2', { calls, out }))
    assert.equal(code, 0)
    assert.equal(calls.latest, 0)
    const report = JSON.parse(out.join('')) as UpdateReport
    assert.equal(stepOf(report, 'install').outcome, 'checkout')
    assert.equal(stepOf(report, 'plugin').outcome, 'checkout')
    assert.match(stepOf(report, 'plugin').message, /npm run install:vault/)
    assert.equal(readFileSync(join(w.plugin, 'main.js'), 'utf8'), '// plugin 0.8.1\n')
  } finally {
    w.cleanup()
  }
})

test('a vault with no plugin folder is reported, and the folder is not created', async () => {
  const w = world()
  try {
    const fresh = w.makePackage('new', '0.9.0')
    const out: string[] = []
    const code = await runUpdate({ dryRun: false, json: false, from: '0.8.2' }, seams(w, fresh, '0.9.0', { out }))
    assert.equal(code, 0)
    const text = out.join('')
    assert.match(text, /plugin not installed in .*: .* does not exist\. wi update does not install it\./)
    assert.match(text, /Community plugins/)
    assert.match(text, /copy main\.js, manifest\.json and styles\.css from .*dist into that folder/)
    assert.doesNotMatch(text, /Reload Obsidian/)
    assert.equal(existsSync(join(w.vault, '.obsidian')), false)
    // Missing skill copies are installed, as wi setup does.
    assert.match(text, /skill installed at /)
    for (const copy of w.skillCopies) assert.ok(existsSync(join(copy, MANAGED_MARKER)))
  } finally {
    w.cleanup()
  }
})

test('with no vault found, the plugin step says how to name one', async () => {
  const w = world()
  try {
    const fresh = w.makePackage('new', '0.9.0')
    const out: string[] = []
    const s = seams(w, fresh, '0.9.0', { out })
    s.env = { XDG_CONFIG_HOME: join(w.home, '.config') }
    await runUpdate({ dryRun: true, json: true, from: '0.8.2' }, s)
    const plugin = stepOf(JSON.parse(out.join('')) as UpdateReport, 'plugin')
    assert.equal(plugin.outcome, 'no-vault')
    assert.match(plugin.message, /--vault <path>/)
  } finally {
    w.cleanup()
  }
})

test('the default vault from the wi config is used when nothing else names one', async () => {
  const w = world()
  try {
    const fresh = w.makePackage('new', '0.9.0')
    installOld(w, w.makePackage('old', '0.8.2'))
    mkdirSync(join(w.home, '.config', 'wi'), { recursive: true })
    writeFileSync(join(w.home, '.config', 'wi', 'config.json'), JSON.stringify({ defaultVault: w.vault }))
    const out: string[] = []
    const s = seams(w, fresh, '0.9.0', { out })
    s.env = { XDG_CONFIG_HOME: join(w.home, '.config') }
    await runUpdate({ dryRun: true, json: true, from: '0.8.2' }, s)
    const plugin = stepOf(JSON.parse(out.join('')) as UpdateReport, 'plugin')
    assert.equal(plugin.outcome, 'would-replace')
    assert.equal(plugin.vault, w.vault)
  } finally {
    w.cleanup()
  }
})

test('--dry-run installs nothing, runs no new wi, and writes nothing', async () => {
  const w = world()
  try {
    const old = w.makePackage('old', '0.8.2')
    installOld(w, old)
    rmSync(w.skillCopies[0]!, { recursive: true })
    const calls: Calls = { latest: 0, install: [], runWi: [] }
    const out: string[] = []
    const code = await runUpdate({ dryRun: true, json: true }, seams(w, old, '0.8.2', { latest: '0.9.0', calls, out }))
    assert.equal(code, 0)
    assert.deepEqual(calls.install, [])
    assert.deepEqual(calls.runWi, [])
    const report = JSON.parse(out.join('')) as UpdateReport
    assert.equal(report.dryRun, true)
    assert.equal(stepOf(report, 'install').outcome, 'would-install')
    assert.deepEqual(stepOf(report, 'skill').copies.map((copy) => copy.outcome), ['would-install', 'current'])
    assert.equal(stepOf(report, 'changes').changes, null)
    assert.match(stepOf(report, 'changes').message, /would print the Agent setup changes after 0\.8\.2, up to 0\.9\.0/)
    assert.equal(existsSync(w.skillCopies[0]!), false)
  } finally {
    w.cleanup()
  }
})

test('a skill folder that wi setup did not make is left alone, and the update goes on', async () => {
  const w = world()
  try {
    const fresh = w.makePackage('new', '0.9.0')
    installOld(w, w.makePackage('old', '0.8.2'))
    rmSync(join(w.skillCopies[0]!, MANAGED_MARKER))
    const out: string[] = []
    const code = await runUpdate({ dryRun: false, json: false, from: '0.8.2' }, seams(w, fresh, '0.9.0', { out }))
    assert.equal(code, 0)
    assert.match(out.join(''), /skill left alone at .*: wi setup did not install it\. .*wi setup --force/)
    assert.match(readFileSync(join(w.skillCopies[0]!, 'SKILL.md'), 'utf8'), /skill 0\.8\.2/)
    assert.match(readFileSync(join(w.plugin, 'main.js'), 'utf8'), /0\.9\.0/)
  } finally {
    w.cleanup()
  }
})

test('--from refuses a value that is not a version', async () => {
  const w = world()
  try {
    const fresh = w.makePackage('new', '0.9.0')
    await assert.rejects(runUpdate({ dryRun: true, json: false, from: 'latest' }, seams(w, fresh, '0.9.0')), /--from needs a version/)
  } finally {
    w.cleanup()
  }
})

test('wi update --from --dry-run runs from the CLI and writes nothing in HOME or the vault', async () => {
  const w = world()
  try {
    const { stdout } = await run('node', [CLI, 'update', '--from', '0.8.0', '--dry-run', '--json', '--vault', w.vault], {
      env: { ...process.env, HOME: w.home, XDG_CONFIG_HOME: join(w.home, '.config'), WI_VAULT: '' },
      cwd: w.root,
    })
    const report = JSON.parse(stdout) as UpdateReport
    assert.equal(report.from, '0.8.0')
    // This test runs from the checkout, so the plugin step is skipped.
    assert.equal(stepOf(report, 'plugin').outcome, 'checkout')
    assert.deepEqual(stepOf(report, 'skill').copies.map((copy) => copy.outcome), ['would-install', 'would-install'])
    assert.equal(existsSync(join(w.home, '.claude')), false)
    assert.equal(existsSync(join(w.vault, '.obsidian')), false)
  } finally {
    w.cleanup()
  }
})

test('the npm package ships the plugin build, and prepack builds it', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
    files: string[]; scripts: Record<string, string>
  }
  for (const file of ['dist/main.js', 'dist/manifest.json', 'dist/styles.css', 'dist/wi/', 'skills/', 'CHANGELOG.md']) {
    assert.ok(pkg.files.includes(file), `package.json files lists ${file}`)
  }
  assert.equal(pkg.scripts['prepack'], 'npm run build')
  assert.match(pkg.scripts['build']!, /build\/plugin\.mjs/)
  assert.match(pkg.scripts['build']!, /build\/wi\.mjs/)
})
