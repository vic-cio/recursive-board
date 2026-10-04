import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { packageRoot, readPackageFile } from './package-files.ts'

test('packageRoot is the folder that holds package.json', () => {
  assert.ok(existsSync(join(packageRoot(), 'package.json')))
})

test('readPackageFile reads the playbook and the changelog that the package ships', async () => {
  assert.match((await readPackageFile('docs/playbook.md')) ?? '', /playbook=summary/)
  assert.match((await readPackageFile('CHANGELOG.md')) ?? '', /^# Changelog/)
})

test('readPackageFile returns null for a missing file', async () => {
  assert.equal(await readPackageFile('docs/no-such-file.md'), null)
})
