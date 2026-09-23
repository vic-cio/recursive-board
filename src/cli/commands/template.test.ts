import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { listTemplates, writeTemplates } from './template.ts'
import { createItem } from './new.ts'
import { loadVault } from '../vault.ts'
import { renderVaultTemplate, requireTemplate, TEMPLATES } from '../../shared/templates.ts'
import { makeVault, item, type Fixture } from '../test-helpers.ts'

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function seed(): Fixture {
  const f = makeVault()
  f.write('Boards/Main.md', item({
    type: 'work-item', id: 'wi-0001', title: 'Main',
    created: '2026-09-21', updated: '2026-09-21',
  }))
  return f
}

test('listTemplates returns the registry', () => {
  assert.equal(listTemplates().length, TEMPLATES.length)
  assert.ok(listTemplates().some((t) => t.name === 'work-item'))
})

test('writeTemplates creates a file per template', async () => {
  fixture = seed()
  const written = await writeTemplates(await loadVault(fixture.root))
  assert.equal(written.length, TEMPLATES.length)
  for (const entry of written) {
    assert.equal(entry.outcome, 'created')
    assert.ok(existsSync(join(fixture.root, entry.relPath)), entry.relPath)
  }
})

test('a generated template matches the renderer exactly', async () => {
  fixture = seed()
  await writeTemplates(await loadVault(fixture.root))
  const text = readFileSync(join(fixture.root, 'Templates/work-item.md'), 'utf8')
  assert.equal(text, renderVaultTemplate(requireTemplate('work-item')))
})

test('generated templates use the vault-configured default root', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"defaultRoot":"House move"}')
  await writeTemplates(await loadVault(fixture.root))
  const text = readFileSync(join(fixture.root, 'Templates/work-item.md'), 'utf8')
  assert.equal(text, renderVaultTemplate(requireTemplate('work-item'), 'House move'))
})

test('generated templates append vault-configured sections', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"extraSections":["References","Risks"]}')
  await writeTemplates(await loadVault(fixture.root))
  const text = readFileSync(join(fixture.root, 'Templates/work-item.md'), 'utf8')
  assert.match(text, /## Notes\n\n## References\n\n- \n\n## Risks\n\n- \n?$/)
})

test('writing twice leaves the file untouched, so it is no sync event', async () => {
  fixture = seed()
  await writeTemplates(await loadVault(fixture.root))
  const again = await writeTemplates(await loadVault(fixture.root))
  for (const entry of again) assert.equal(entry.outcome, 'unchanged')
})

test('writeTemplates overwrites a template that has drifted', async () => {
  fixture = seed()
  await writeTemplates(await loadVault(fixture.root))
  writeFileSync(join(fixture.root, 'Templates/work-item.md'), '# hand edited\n')
  const again = await writeTemplates(await loadVault(fixture.root))
  assert.equal(again[0]!.outcome, 'updated')
  assert.equal(
    readFileSync(join(fixture.root, 'Templates/work-item.md'), 'utf8'),
    renderVaultTemplate(requireTemplate('work-item')),
  )
})

test('writeTemplates creates the folder when a vault has none', async () => {
  fixture = makeVault()
  fixture.write('Boards/Main.md', item({ type: 'work-item', id: 'wi-1', title: 'Main' }))
  const written = await writeTemplates(await loadVault(fixture.root))
  assert.ok(existsSync(join(fixture.root, written[0]!.relPath)))
})

test('a generated template and a created work item share one body', async () => {
  fixture = seed()
  fixture.write('.wi.json', '{"extraSections":["References"]}')
  await writeTemplates(await loadVault(fixture.root))
  const created = await createItem(await loadVault(fixture.root), {
    title: 'Streaming', parent: 'wi-0001',
  })

  const body = (text: string) => text.slice(text.indexOf('\n---\n', 3) + 5)
  assert.equal(
    body(readFileSync(created.path, 'utf8')),
    body(readFileSync(join(fixture.root, 'Templates/work-item.md'), 'utf8')),
    'the vault template cannot drift from what wi new writes',
  )
})

test('wi new refuses a template name that does not exist', async () => {
  fixture = seed()
  await assert.rejects(
    createItem(await loadVault(fixture.root), {
      title: 'Streaming', parent: 'wi-0001', template: 'nope',
    }),
    /no template called "nope"/,
  )
})

test('wi new accepts a template by name', async () => {
  fixture = seed()
  const created = await createItem(await loadVault(fixture.root), {
    title: 'Streaming', parent: 'wi-0001', template: 'work-item',
  })
  assert.match(readFileSync(created.path, 'utf8'), /## Objective/)
})

test('a generated template is a valid work item shape, bar the blanks a human fills', async () => {
  fixture = seed()
  await writeTemplates(await loadVault(fixture.root))
  const vault = await loadVault(fixture.root)
  // Templates/ is not Boards/, so a template is never indexed as a work item.
  assert.equal(vault.items.length, 1)
  assert.deepEqual(vault.misplaced, [])
})
