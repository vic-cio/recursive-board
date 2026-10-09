/** Each storage port operation behaves the same on the Node port and on the Obsidian port. */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { nodePort } from './node-port.ts'
import { makeVault, type Fixture } from './test-helpers.ts'
import { isPathExists, readIfPresent, type StoragePort } from '../shared/storage.ts'
import { FOLDERS } from '../shared/schema.ts'
import { obsidianPort } from '../plugin/obsidian-port.ts'
import { fakeObsidian } from '../plugin/fake-obsidian.ts'

const FILES: Record<string, string> = {
  'Boards/Card.md': 'card\n',
  'Boards/.Card 2.md.icloud': 'stub',
  'Boards/Deep/Misplaced.md': 'deep\n',
  '.obsidian/plugins/x.md': 'tool\n',
  'Top.md': 'top\n',
}

let fixture: Fixture | undefined
afterEach(() => {
  fixture?.cleanup()
  fixture = undefined
})

function ports(): [string, StoragePort][] {
  fixture = makeVault()
  for (const [path, text] of Object.entries(FILES)) fixture.write(path, text)
  return [['node', nodePort(fixture.root)], ['obsidian', obsidianPort(fakeObsidian(FILES, FOLDERS))]]
}

test('list gives every file under a folder, hidden ones too, and skips the named folders', async () => {
  for (const [name, port] of ports()) {
    assert.deepEqual((await port.list('Boards')).sort(), ['Boards/.Card 2.md.icloud', 'Boards/Card.md', 'Boards/Deep/Misplaced.md'], name)
    assert.deepEqual((await port.list('', new Set(['.obsidian', 'Deep']))).sort(), ['Boards/.Card 2.md.icloud', 'Boards/Card.md', 'Top.md'], name)
    assert.deepEqual(await port.list('Nowhere'), [], name)
  }
})

test('read, exists and readIfPresent', async () => {
  for (const [name, port] of ports()) {
    assert.equal(await port.read('Boards/Card.md'), 'card\n', name)
    assert.equal(await port.exists('Boards/Card.md'), true, name)
    assert.equal(await port.exists('Boards'), true, name)
    assert.equal(await port.exists('Boards/Gone.md'), false, name)
    assert.equal(await readIfPresent(port, 'Boards/Gone.md'), null, name)
    await assert.rejects(port.read('Boards/Gone.md'), name)
  }
})

test('create refuses a taken path with an error shared code can test, and changes nothing', async () => {
  for (const [name, port] of ports()) {
    await port.create('Boards/New.md', 'new\n')
    assert.equal(await port.read('Boards/New.md'), 'new\n', name)
    await assert.rejects(port.create('Boards/Card.md', 'other\n'), (error) => isPathExists(error), name)
    assert.equal(await port.read('Boards/Card.md'), 'card\n', name)
  }
})

test('update writes what the edit returns, and a refusal writes nothing', async () => {
  for (const [name, port] of ports()) {
    assert.equal(await port.update('Boards/Card.md', (text) => `${text}more\n`), 'card\nmore\n', name)
    assert.equal(await port.read('Boards/Card.md'), 'card\nmore\n', name)
    await assert.rejects(port.update('Boards/Card.md', () => { throw new Error('refused') }), /refused/, name)
    assert.equal(await port.update('Boards/Card.md', (text) => text), 'card\nmore\n', name)
    await port.write('Boards/Card.md', 'replaced\n')
    assert.equal(await port.read('Boards/Card.md'), 'replaced\n', name)
  }
})

test('mkdir makes every missing folder, and rename moves a file into it', async () => {
  for (const [name, port] of ports()) {
    await port.mkdir('.trash/a/b')
    await port.mkdir('.trash/a/b')
    await port.rename('Boards/Card.md', '.trash/a/b/Card.md')
    assert.equal(await port.exists('Boards/Card.md'), false, name)
    assert.equal(await port.read('.trash/a/b/Card.md'), 'card\n', name)
  }
})

test('withLock runs one holder of a key at a time', async () => {
  for (const [name, port] of ports()) {
    const order: string[] = []
    const hold = (tag: string) => port.withLock('.wi-test-lock', async () => {
      order.push(`${tag} in`)
      await new Promise((resolve) => setTimeout(resolve, 10))
      order.push(`${tag} out`)
    })
    await Promise.all([hold('a'), hold('b')])
    assert.ok(order.join() === 'a in,a out,b in,b out' || order.join() === 'b in,b out,a in,a out', `${name}: ${order.join()}`)
  }
})
