import { test } from 'node:test'
import assert from 'node:assert/strict'

import { activeAgentNames, activeAgents, waitsOnChildren, type AgentItem, type AgentTree } from './agents.ts'

interface Fake extends AgentItem { title: string; parent: Fake | null }

function vault() {
  const items: Fake[] = []
  const add = (title: string, parent: Fake | null, fields: Partial<Fake> = {}): Fake => {
    const item: Fake = { title, parent, status: parent ? 'backlog' : undefined, holder: undefined, effectiveArchived: false, ...fields }
    items.push(item)
    return item
  }
  const tree: AgentTree<Fake> = { childrenOf: (item) => items.filter((other) => other.parent === item) }
  return { items, add, tree }
}

test('a card waits on its children when it has open children and every one is in doing', () => {
  const { add, tree } = vault()
  const root = add('Home', null)
  const parent = add('Parent', root, { status: 'doing', holder: 'lead' })
  assert.equal(waitsOnChildren(parent, tree), false, 'a card with no children does its own work')
  const first = add('First', parent, { status: 'doing', holder: 'worker-1' })
  add('Gone', parent, { status: 'options', effectiveArchived: true })
  add('Closed', parent, { status: 'done' })
  assert.equal(waitsOnChildren(parent, tree), true, 'done and archived children are not open')
  const second = add('Second', parent, { status: 'options' })
  assert.equal(waitsOnChildren(parent, tree), false, 'a child in options is work the parent can still do')
  second.status = 'backlog'
  assert.equal(waitsOnChildren(parent, tree), false)
  second.status = 'doing'
  assert.equal(waitsOnChildren(parent, tree), true)
  first.status = 'done'
  second.status = 'done'
  assert.equal(waitsOnChildren(parent, tree), false, 'with every child done, the parent works again')
})

test('the active count skips a doing card whose open children are all in doing', () => {
  const { items, add, tree } = vault()
  const root = add('Home', null)
  const parent = add('Parent', root, { status: 'doing', holder: 'lead' })
  add('First', parent, { status: 'doing', holder: 'worker-1' })
  const second = add('Second', parent, { status: 'doing', holder: 'worker-2' })
  assert.deepEqual([...activeAgentNames(items, [], tree)].sort(), ['worker-1', 'worker-2'], 'lead only waits on its children')

  second.status = 'options'
  assert.equal(activeAgentNames(items, [], tree).size, 2, 'lead has a child left to work, so it counts')

  second.status = 'doing'
  add('Other', root, { status: 'doing', holder: 'lead' })
  assert.equal(activeAgentNames(items, [], tree).size, 3, 'lead counts through a card it works')
})

test('the active count skips a doing card that waits for a review verdict', () => {
  const { items, add, tree } = vault()
  const root = add('Home', null)
  const sent = add('Sent', root, { status: 'doing', holder: 'worker-1' })
  add('Working', root, { status: 'doing', holder: 'worker-2' })
  assert.equal(activeAgentNames(items, [], tree).size, 2, 'with no review rule, both count')
  const awaits = (card: Fake) => card === sent
  assert.deepEqual([...activeAgentNames(items, [], tree, awaits)], ['worker-2'], 'worker-1 only waits for the verdict')
})

test('people, requests for any agent and cards out of doing add no agent', () => {
  const { items, add, tree } = vault()
  const root = add('Home', null)
  add('Alice task', root, { status: 'doing', holder: 'Alice' })
  add('Asked', root, { status: 'doing', holder: 'agent' })
  add('Planned', root, { status: 'options', holder: 'pi' })
  add('Closed', root, { status: 'done', holder: 'pi' })
  const writer = add('Writer task', root, { status: 'doing', holder: 'Writer' })
  assert.deepEqual(activeAgents(items, ['alice'], tree), [{ name: 'Writer', cards: [writer] }])
})

test('an agent that holds a card and its current subtask counts once, with both cards', () => {
  const { items, add, tree } = vault()
  const root = add('Home', null)
  const parent = add('Parent', root, { status: 'doing', holder: 'claude' })
  const step = add('Step', parent, { status: 'doing', holder: 'Claude' })
  add('Later', parent, { status: 'options' })
  assert.deepEqual(activeAgents(items, [], tree), [{ name: 'claude', cards: [parent, step] }])
})
