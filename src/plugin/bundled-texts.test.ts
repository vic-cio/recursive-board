import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { PLAYBOOK, SKILL } from './bundled-texts.ts'

const file = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('the bundled skill and playbook equal the files; run node build/bundled-texts.mjs after an edit', () => {
  assert.equal(SKILL, file('skills/recursive-board/SKILL.md'))
  assert.equal(PLAYBOOK, file('docs/playbook.md'))
})
