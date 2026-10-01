import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyReviewRequest, applyVerdict, awaitsReviewVerdict } from './review.ts'

const card = [
  '---',
  'type: work-item',
  'id: wi-a7f3',
  'title: Price the lines',
  'status: doing',
  'parent: "[[Quote]]"',
  'owner: Ana',
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

test('send for review sets the owner and appends a dated Review line with the files in one result', () => {
  const after = applyReviewRequest(card, { to: 'Ana', files: ['Work/quote.xlsx', 'Docs/check.md'], writer: 'Writer', now })
  assert.match(after, /^owner: Ana$/m)
  assert.ok(after.includes('- 2026-09-28 15:04, Writer: **Review:** Please review `Work/quote.xlsx`, `Docs/check.md`.\n'))
  assert.equal(after.match(/^owner:/gm)?.length, 1)
  assert.match(after, /^agent: codex$/m)
})

test('send for review needs an owner and makes a one-line note', () => {
  assert.throws(() => applyReviewRequest(card, { to: ' ', now }), /person/)
  assert.throws(() => applyReviewRequest(card, { to: 'Ana', files: ['a\nb'], now }), /one line/)
})

test('only the last Review or verdict note decides whether review is waiting', () => {
  const notes = (lines: string) => `---\ntype: work-item\n---\n\n## Objective\n\n**Review:** in body is not a note.\n\n## Notes\n\n${lines}`
  assert.equal(awaitsReviewVerdict(notes('- **Review:** Check this.\n')), true)
  assert.equal(awaitsReviewVerdict(notes('- **Review:** Check this.\n- Approved by Ana.\n')), false)
  assert.equal(awaitsReviewVerdict(notes('- **Review:** First.\n- Sent back by Ana.\n- **Review:** Again.\n')), true)
  assert.equal(awaitsReviewVerdict(notes('- Approved by Ana.\n')), false)
  assert.equal(awaitsReviewVerdict('## Objective\n\n- **Review:** Not sent.\n'), false)
})

test('approve notes who approved and closes the card', () => {
  const after = applyVerdict(card, { verdict: 'approve', you: 'Ana' }, now)
  assert.match(after, /^status: done$/m)
  assert.match(after, /^prev_status: doing$/m)
  assert.match(after, /^owner: Ana$/m)
  assert.match(after, /^updated: 2026-09-28$/m)
  assert.ok(after.includes('`Work/quote.xlsx`\n- 2026-09-28 15:04: Approved by Ana.\n\n## Knowledge'))
})

test('send back notes the comment and hands the card back to its agent', () => {
  const after = applyVerdict(card, { verdict: 'send back', you: 'Ana', comment: ' Recheck the VAT. ' }, now)
  assert.match(after, /^status: doing$/m)
  assert.doesNotMatch(after, /^owner:/m)
  assert.match(after, /^agent: codex$/m)
  assert.ok(after.includes('- 2026-09-28 15:04: Sent back by Ana: Recheck the VAT.\n\n## Knowledge'))
})

test('a blank send back notes no comment and still hands the card back', () => {
  const after = applyVerdict(card, { verdict: 'send back', you: 'Ana', comment: '  ' }, now)
  assert.doesNotMatch(after, /^owner:/m)
  assert.ok(after.includes('- 2026-09-28 15:04: Sent back by Ana.\n\n## Knowledge'))
})

test('a send back comment is one line', () => {
  assert.throws(() => applyVerdict(card, { verdict: 'send back', you: 'Ana', comment: 'a\nb' }, now), /one line/)
})

test('a verdict needs your name and a card in doing', () => {
  assert.throws(() => applyVerdict(card, { verdict: 'approve', you: ' ' }, now), /your name/)
  const done = card.replace('status: doing', 'status: done')
  assert.throws(() => applyVerdict(done, { verdict: 'approve', you: 'Ana' }, now), /in doing/)
})
