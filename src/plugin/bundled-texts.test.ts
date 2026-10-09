import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { SKILL } from './bundled-texts.ts'

const file = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('the bundled skill equals the file; run node build/bundled-texts.mjs after an edit', () => {
  assert.equal(SKILL, file('skills/recursive-board/SKILL.md'))
})
