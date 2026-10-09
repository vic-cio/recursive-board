import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createItem } from './new.ts'
import { loadVault } from '../vault.ts'
import { parseFrontmatter } from '../../shared/frontmatter.ts'
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
  }, '# Main\n'))
  f.write('Boards/Build server.md', item({
    type: 'work-item', id: 'wi-0004', title: 'Build server', status: 'doing',
    parent: '"[[Main]]"', owner: 'sam', agent: 'codex',
    created: '2026-09-21', updated: '2026-09-21',
  }, '# Build server\n'))
  return f
}

async function reload(f: Fixture) {
  return loadVault(f.root)
}

test('createItem writes a file into Boards with the nine-field shape', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })

  assert.equal(created.relPath, 'Boards/Streaming.md')
  const fm = parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!
  assert.equal(fm.get('type'), 'work-item')
  assert.match(String(fm.get('id')), /^wi-[a-z0-9]{4}$/)
  assert.equal(fm.get('title'), 'Streaming')
  assert.equal(fm.get('status'), 'backlog')
  assert.equal(fm.has('holder'), false, 'default backlog items are not assigned to the parent holder')
  assert.equal(fm.has('agent'), false)
  assert.equal(fm.get('parent'), '[[Build server]]')
  assert.match(String(fm.get('created')), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(fm.get('created'), fm.get('updated'))
})

test('createItem with the area template writes a backlog area by default', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Operations', parent: 'wi-0001', template: 'area',
  })
  const text = readFileSync(join(fixture!.root, created.relPath), 'utf8')
  const fm = parseFrontmatter(text)!
  assert.equal(fm.get('area'), true)
  assert.equal(fm.get('status'), 'backlog')
  assert.equal(fm.get('parent'), '[[Main]]')
  assert.match(text, /## Objective/)
})

test('createItem wraps placeholders in brief body fields', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Stream', parent: 'wi-0001',
    brief: {
      objective: 'Use <port> for <topic>.',
      context: ['See <path/to/source>.'],
      criteria: ['The link [docs](<docs/index.md>) stays intact.'],
    },
  })

  const body = readFileSync(join(fixture!.root, created.relPath), 'utf8')
  assert.match(body, /Use `<port>` for `<topic>`\./)
  assert.match(body, /See `<path\/to\/source>`\./)
  assert.match(body, /\[docs\]\(<docs\/index\.md>\)/)
})

test('createItem with the area template accepts an explicit status', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Operations', parent: 'wi-0001', template: 'area', status: 'doing',
  })
  assert.equal(parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!.get('status'), 'doing')
})

test('createItem does not inherit a holder for an area', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Operations', parent: 'wi-0004', template: 'area', status: 'doing',
  })
  const fm = parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!
  assert.equal(fm.get('area'), true)
  assert.equal(fm.get('status'), 'doing')
  assert.equal(fm.has('holder'), false)
})

test('createItem refuses an explicit holder for an area before writing', async () => {
  fixture = seed()
  await assert.rejects(
    createItem(await reload(fixture), {
      title: 'Operations', parent: 'wi-0001', template: 'area', status: 'doing', holder: 'Alpha',
    }),
    /areas cannot have a holder/i,
  )
  assert.equal(existsSync(join(fixture.root, 'Boards', 'Operations.md')), false)
})

test('createItem uses the configured folder and root when no parent is given', async () => {
  fixture = seed()
  fixture.writeSettings('{"workItemFolder":"Projects","defaultRoot":"Launch"}')
  fixture.write('Projects/Launch.md', item({
    type: 'work-item', id: 'wi-0100', title: 'Launch', created: '2026-09-21', updated: '2026-09-21',
  }))
  const created = await createItem(await reload(fixture), { title: 'Plan' })
  assert.equal(created.relPath, 'Projects/Plan.md')
  assert.equal(parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!.get('parent'), '[[Launch]]')
})

test('createItem never writes board or prev_status on a fresh item', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })
  const fm = parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!
  assert.equal(fm.has('board'), false, 'absence means not a board')
  assert.equal(fm.has('prev_status'), false)
})

test('createItem does not inherit owner, and inherits the parent\'s old agent as holder only for doing', async (t) => {
  for (const [status, expectedAgent] of [
    ['backlog', undefined],
    ['options', undefined],
    ['doing', 'codex'],
    ['done', undefined],
  ] as const) {
    await t.test(status, async () => {
      fixture = seed()
      const created = await createItem(await reload(fixture), {
        title: 'Streaming', parent: 'wi-0004', status,
      })
      const fm = parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!
      assert.equal(fm.has('owner'), false)
      assert.equal(fm.get('holder'), expectedAgent)
      assert.equal(fm.has('agent'), false)
      fixture.cleanup()
      fixture = undefined
    })
  }
})

test('createItem does not invent owner or holder when the parent has none', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Top level', parent: 'wi-0001' })
  const fm = parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!
  assert.equal(fm.has('owner'), false)
  assert.equal(fm.has('holder'), false)
})

test('an explicit owner beats the inherited one', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Streaming', parent: 'wi-0004', owner: 'lee',
  })
  assert.equal(parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!.get('owner'), 'lee')
})

test('an explicit holder beats the status-based inheritance rule', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Streaming', parent: 'wi-0004', status: 'options', holder: 'lee',
  })
  assert.equal(parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!.get('holder'), 'lee')
})

test('createItem accepts a status, which is how the board add row works', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Streaming', parent: 'wi-0004', status: 'options',
  })
  assert.equal(parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!.get('status'), 'options')
})

test('createItem writes the template body with Objective first', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })
  const text = readFileSync(join(fixture!.root, created.relPath), 'utf8')
  assert.ok(text.indexOf('## Objective') < text.indexOf('## Context'))
  assert.ok(text.indexOf('## Context') < text.indexOf('## Acceptance Criteria'))
})

test('createItem appends vault-configured sections', async () => {
  fixture = seed()
  fixture.writeSettings('{"extraSections":["References","Risks"]}')
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })
  assert.match(readFileSync(join(fixture!.root, created.relPath), 'utf8'),
    /## Notes\n\n## References\n\n## Risks\n?$/)
})

test('the body carries no H1, because Obsidian already draws the filename as the title', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })
  const text = readFileSync(join(fixture!.root, created.relPath), 'utf8')
  assert.doesNotMatch(text, /^# /m, 'an H1 repeating the title shows the same words twice')
  assert.match(text, /^---\n[\s\S]*?\n---\n## Objective\n/, 'Objective is the first line of the body, with no blank line above it')
})

test('createItem resolves the parent by id, filename or title', async () => {
  fixture = seed()
  const root = fixture.root
  for (const [i, ref] of ['wi-0004', 'Build server', 'build server'].entries()) {
    const created = await createItem(await reload(fixture), { title: `Child ${i}`, parent: ref })
    const fm = parseFrontmatter(readFileSync(join(root, created.relPath), 'utf8'))!
    assert.equal(fm.get('parent'), '[[Build server]]')
  }
})

test('createItem links the parent by filename, not by title', async () => {
  fixture = seed()
  fixture.write('Boards/Auth--b2e1.md', item({
    type: 'work-item', id: 'wi-0014', title: 'Authentication', status: 'backlog',
    parent: '"[[Main]]"', created: '2026-09-22', updated: '2026-09-22',
  }))
  const created = await createItem(await reload(fixture), { title: 'Tokens', parent: 'wi-0014' })
  const fm = parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!
  assert.equal(fm.get('parent'), '[[Auth--b2e1]]', 'the wikilink is authoritative for resolution')
})

test('createItem adds the id suffix when the filename is taken', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Build server', parent: 'wi-0001',
  })
  assert.match(created.relPath, /^Boards\/Build server--[a-z0-9]{4}\.md$/)
  assert.equal(parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!.get('title'), 'Build server')
})

test('createItem mints an id no existing item holds', async () => {
  fixture = seed()
  const ids = new Set<string>()
  for (let i = 0; i < 25; i++) {
    const created = await createItem(await reload(fixture), { title: `Item ${i}`, parent: 'wi-0001' })
    assert.equal(ids.has(created.id), false)
    ids.add(created.id)
  }
  const vault = await reload(fixture)
  assert.deepEqual(vault.duplicateIds, [])
})

test('the new item is a child of its parent on the next load', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0004' })
  const vault = await reload(fixture)
  const children = vault.childrenOf(vault.byId.get('wi-0004')!)
  assert.deepEqual(children.map((i) => i.id), [created.id])
})

test('createItem refuses an unresolvable parent', async () => {
  fixture = seed()
  await assert.rejects(
    createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-nope' }),
    /no work item/i,
  )
})

test('createItem requires a parent, because only the root has none', async () => {
  fixture = seed()
  await assert.rejects(
    createItem(await reload(fixture), { title: 'Streaming', parent: '' }),
    /parent/i,
  )
})

test('createItem refuses an empty title', async () => {
  fixture = seed()
  await assert.rejects(
    createItem(await reload(fixture), { title: '   ', parent: 'wi-0001' }),
    /title/i,
  )
})

test('createItem refuses an invalid status rather than writing a fifth value', async () => {
  fixture = seed()
  await assert.rejects(
    // @ts-expect-error the CLI parses this from argv, so the guard must exist at runtime
    createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0001', status: 'active' }),
    /status/i,
  )
})

test('createItem never overwrites a file that is already there', async () => {
  fixture = seed()
  fixture.write('Boards/Streaming.md', '# a note that is not a work item\n')
  await assert.rejects(
    createItem(await reload(fixture), { title: 'Streaming', parent: 'wi-0001' }),
    /exists/i,
  )
  assert.equal(readFileSync(join(fixture.root, 'Boards/Streaming.md'), 'utf8'),
    '# a note that is not a work item\n')
})

test('createItem sanitises a title that is not filename-safe', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Ship v1/v2: the [[hard]] one?', parent: 'wi-0001',
  })
  assert.ok(existsSync(join(fixture!.root, created.relPath)))
  assert.equal(
    parseFrontmatter(readFileSync(join(fixture!.root, created.relPath), 'utf8'))!.get('title'),
    'Ship v1/v2: the [[hard]] one?',
    'the title keeps the characters the filename had to drop',
  )
})

test('createItem writes the brief into the body in one command', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), {
    title: 'Price demolition', parent: 'wi-0004',
    brief: { objective: 'Price every line.', context: ['Survey of 2026-09-01.'], criteria: ['Each line has a rate'] },
  })
  const text = readFileSync(join(fixture!.root, created.relPath), 'utf8')
  assert.match(text, /## Objective\n\nPrice every line\.\n/)
  assert.match(text, /## Context\n\nSurvey of 2026-09-01\.\n/)
  assert.match(text, /## Acceptance Criteria\n\n- Each line has a rate\n/)
  assert.deepEqual(created.gaps, [])
})

test('createItem reports brief gaps, and refuses them under strict before any write', async () => {
  fixture = seed()
  const loose = await createItem(await reload(fixture), { title: 'Loose', parent: 'wi-0004' })
  assert.deepEqual(loose.gaps, ['Objective', 'Acceptance Criteria'])
  await assert.rejects(
    createItem(await reload(fixture), { title: 'Strict', parent: 'wi-0004', strict: true, brief: { objective: 'x' } }),
    /no Acceptance Criteria/,
  )
  assert.equal(existsSync(join(fixture.root, 'Boards', 'Strict.md')), false)
})

test('createItem promotes a card to a board on its first child only', async () => {
  fixture = seed()
  const parentPath = join(fixture.root, 'Boards', 'Build server.md')
  const first = await createItem(await reload(fixture), { title: 'One', parent: 'wi-0004' })
  assert.equal(first.promotedParent, true)
  assert.equal(parseFrontmatter(readFileSync(parentPath, 'utf8'))!.get('board'), true)

  // A person demotes it to a checklist. The next child must not undo that.
  writeFileSync(parentPath, readFileSync(parentPath, 'utf8').replace('board: true\n', ''))
  const second = await createItem(await reload(fixture), { title: 'Two', parent: 'wi-0004' })
  assert.equal(second.promotedParent, false)
  assert.equal(parseFrontmatter(readFileSync(parentPath, 'utf8'))!.has('board'), false)
})

test('createItem leaves the parent alone when autoPromote is off, or the parent is a root', async () => {
  fixture = seed()
  const rootBefore = readFileSync(join(fixture.root, 'Boards', 'Main.md'), 'utf8')
  const underRoot = await createItem(await reload(fixture), { title: 'Top', parent: 'wi-0001' })
  assert.equal(underRoot.promotedParent, false)
  assert.equal(readFileSync(join(fixture.root, 'Boards', 'Main.md'), 'utf8'), rootBefore)

  fixture.writeSettings('{"autoPromote":false}')
  const off = await createItem(await reload(fixture), { title: 'Off', parent: 'wi-0004' })
  assert.equal(off.promotedParent, false)
})

test('createItem flags a title whose plain filename is taken', async () => {
  fixture = seed()
  const created = await createItem(await reload(fixture), { title: 'Build: server', parent: 'wi-0001' })
  assert.equal(created.renamed, false, 'the colon becomes a hyphen, and "Build- server" is free')
  const clash = await createItem(await reload(fixture), { title: 'Build server', parent: 'wi-0001' })
  assert.equal(clash.renamed, true)
  assert.match(clash.relPath, /^Boards\/Build server--[a-z0-9]{4}\.md$/)
})
