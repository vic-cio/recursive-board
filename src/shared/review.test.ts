import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyVerdict } from './review.ts'

const card = [
  '---',
  'type: work-item',
  'id: wi-a7f3',
  'title: Price the lines',
  'status: doing',
  'parent: "[[Quote]]"',
  'owner: Victor',
  'agent: codex',
  'updated: 2026-09-20',
  '---',
  '',
  '## Notes',
  '',
  "- 2026-09-20 10:00, codex: **Review:** Check the totals: `Work/quote.xlsx`",
  '',
  '## Knowledge',
  '',
  '- ',
  '',
].join('\n')

const now = new Date(2026, 8, 28, 15, 4)

test('approve notes who approved and closes the card', () => {
  const after = applyVerdict(card, { verdict: 'approve', you: 'Victor' }, now)
  assert.match(after, /^status: done$/m)
  assert.match(after, /^prev_status: doing$/m)
  assert.match(after, /^owner: Victor$/m)
  assert.match(after, /^updated: 2026-09-28$/m)
  assert.ok(after.includes('`Work/quote.xlsx`\n- 2026-09-28 15:04: Approved by Victor.\n\n## Knowledge'))
})

test('send back notes the comment and hands the card back to its agent', () => {
  const after = applyVerdict(card, { verdict: 'send back', you: 'Victor', comment: ' Recheck the VAT. ' }, now)
  assert.match(after, /^status: doing$/m)
  assert.doesNotMatch(after, /^owner:/m)
  assert.match(after, /^agent: codex$/m)
  assert.ok(after.includes('- 2026-09-28 15:04: Sent back by Victor: Recheck the VAT.\n\n## Knowledge'))
})

test('send back needs a one-line comment', () => {
  assert.throws(() => applyVerdict(card, { verdict: 'send back', you: 'Victor', comment: '  ' }, now), /comment/)
  assert.throws(() => applyVerdict(card, { verdict: 'send back', you: 'Victor', comment: 'a\nb' }, now), /one line/)
})

test('a verdict needs your name and a card in doing', () => {
  assert.throws(() => applyVerdict(card, { verdict: 'approve', you: ' ' }, now), /your name/)
  const done = card.replace('status: doing', 'status: done')
  assert.throws(() => applyVerdict(done, { verdict: 'approve', you: 'Victor' }, now), /in doing/)
})
