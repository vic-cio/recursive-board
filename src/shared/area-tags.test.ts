import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  areaColourGroups, areaSlug, areaTagFor, hasAreaTag, isAreaColourGroup, withAreaTag,
} from './area-tags.ts'

test('areaSlug makes a tag segment from a title', () => {
  assert.equal(areaSlug('Obsidian Development'), 'obsidian-development')
  assert.equal(areaSlug('35b The Cut: pricing'), '35b-the-cut-pricing')
  assert.equal(areaSlug('Café & Bar'), 'cafe-bar')
  assert.equal(areaSlug('!!!'), 'untitled')
})

test('areaTagFor names every area in the chain from the top down', () => {
  const card = { title: 'Fix it', area: false }
  const inner = { title: 'Recursive Board', area: true }
  const outer = { title: 'Obsidian Development', area: true }
  const root = { title: 'Main', area: false }
  assert.equal(areaTagFor([card, inner, outer, root]), 'area/obsidian-development/recursive-board')
  assert.equal(areaTagFor([inner, outer, root]), 'area/obsidian-development/recursive-board')
  assert.equal(areaTagFor([card, root]), null)
})

test('withAreaTag replaces area tags and keeps the others in order', () => {
  assert.deepEqual(withAreaTag(['design', 'area/old', '#area/older', 'plugin'], 'area/new'), ['design', 'plugin', 'area/new'])
  assert.deepEqual(withAreaTag(['design', 'area/old'], null), ['design'])
  assert.equal(hasAreaTag(['design', 'area/x'], 'area/x'), true)
  assert.equal(hasAreaTag(['area/x', 'area/y'], 'area/x'), false)
  assert.equal(hasAreaTag(['design'], null), true)
})

test('areaColourGroups puts deeper areas first, boards before cards, and shares a family hue', () => {
  const groups = areaColourGroups(['area/a', 'area/a/b', 'design', 'area/a'])
  assert.deepEqual(groups.map((g) => g.query), [
    'tag:#area/a/b ([board:true] OR [area:true])', 'tag:#area/a/b',
    'tag:#area/a ([board:true] OR [area:true])', 'tag:#area/a',
  ])
  const [subBoard, subCard, board, card] = groups.map((g) => g.color.rgb)
  const light = (rgb: number) => ((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)
  assert.ok(light(board!) < light(card!), 'a board is darker than a card')
  assert.ok(light(subCard!) > light(card!), 'a sub-area is lighter than its parent')
  assert.ok(light(subBoard!) < light(subCard!))
  assert.ok(groups.every(isAreaColourGroup))
  assert.equal(isAreaColourGroup({ query: 'path:Knowledge' }), false)
})
