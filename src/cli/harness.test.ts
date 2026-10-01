import { test } from 'node:test'
import assert from 'node:assert/strict'

import { launchSpec, workerPrompt, type WorkerRun } from './harness.ts'

const run = (overrides: Partial<WorkerRun> = {}): WorkerRun => ({
  harness: 'claude',
  model: 'm-1',
  worktree: '/repo-worktrees/price-the-job',
  vault: '/vault',
  prompt: 'the brief',
  sessionId: '00000000-0000-4000-8000-000000000001',
  name: 'wi-a1 Price the job',
  agent: 'claude-price-the-job',
  card: 'wi-a1',
  role: 'Coder',
  ...overrides,
})

test('claude runs headless in the worktree, with the vault added and the prompt on stdin', () => {
  const spec = launchSpec(run())
  assert.equal(spec.command, 'claude')
  assert.deepEqual(spec.args, ['-p', '--model', 'm-1', '--permission-mode', 'auto',
    '--session-id', '00000000-0000-4000-8000-000000000001', '--name', 'wi-a1 Price the job', '--add-dir', '/vault'])
  assert.equal(spec.cwd, '/repo-worktrees/price-the-job')
  assert.equal(spec.stdin, 'the brief')
  assert.equal(spec.resume, 'claude --resume 00000000-0000-4000-8000-000000000001')
})

test('claude takes another permission mode, and refuses a mode it does not know', () => {
  assert.deepEqual(launchSpec(run({ permission: 'acceptEdits' })).args.slice(3, 5), ['--permission-mode', 'acceptEdits'])
  assert.throws(() => launchSpec(run({ permission: 'yolo' })), /claude takes --permission acceptEdits, auto/)
})

test('codex runs exec with a workspace-write sandbox, network on, the vault added and the prompt on stdin', () => {
  const spec = launchSpec(run({ harness: 'codex', agent: 'codex-price-the-job' }))
  assert.equal(spec.command, 'codex')
  assert.deepEqual(spec.args, ['exec', '-m', 'm-1', '-s', 'workspace-write',
    '-c', 'sandbox_workspace_write.network_access=true',
    '-C', '/repo-worktrees/price-the-job', '--add-dir', '/vault', '-'])
  assert.equal(spec.stdin, 'the brief')
  assert.equal(spec.resume, 'codex resume')
})

test('codex takes a read-only sandbox without the network setting', () => {
  const spec = launchSpec(run({ harness: 'codex', permission: 'read-only' }))
  assert.deepEqual(spec.args.slice(3, 7), ['-s', 'read-only', '-C', '/repo-worktrees/price-the-job'])
  assert.throws(() => launchSpec(run({ harness: 'codex', permission: 'auto' })), /codex takes --permission read-only/)
})

test('pi runs with a saved session, and the prompt as its message', () => {
  const spec = launchSpec(run({ harness: 'pi', agent: 'pi-price-the-job' }))
  assert.equal(spec.command, 'pi')
  assert.deepEqual(spec.args, ['-p', '--model', 'm-1', '--session-id', '00000000-0000-4000-8000-000000000001',
    '--name', 'wi-a1 Price the job', '--', 'the brief'])
  assert.ok(!spec.args.includes('--no-session'))
  assert.equal(spec.stdin, undefined)
  assert.equal(spec.resume, 'pi --session-id 00000000-0000-4000-8000-000000000001')
  assert.throws(() => launchSpec(run({ harness: 'pi', permission: 'auto' })), /pi has no permission modes/)
})

test('with no model, the harness picks its own and WI_MODEL is removed', () => {
  for (const harness of ['claude', 'codex', 'pi'] as const) {
    const spec = launchSpec(run({ harness, model: undefined }))
    assert.ok(!spec.args.includes('--model') && !spec.args.includes('-m'), harness)
    assert.ok('WI_MODEL' in spec.env && spec.env['WI_MODEL'] === undefined, harness)
  }
})

test('the worker environment names the vault, the card, the agent, the role and the model', () => {
  assert.deepEqual(launchSpec(run()).env, {
    WI_VAULT: '/vault', WI_CARD: 'wi-a1', WI_AGENT: 'claude-price-the-job', WI_MODEL: 'm-1',
  })
  assert.equal('WI_CREATOR' in launchSpec(run({ role: undefined })).env, false)
})

test('workerPrompt names the card, the agent, the worktree and the role, then gives the card body', () => {
  const prompt = workerPrompt({
    card: 'wi-a1', title: 'Price the job', agent: 'codex-price-the-job', vault: '/vault',
    worktree: '/wt/price-the-job', branch: 'card/price-the-job', role: 'Coder',
    body: '## Objective\n\nPrice it.\n',
  })
  assert.match(prompt, /You are codex-price-the-job, a worker on the card wi-a1 "Price the job"/)
  assert.match(prompt, /\/wt\/price-the-job, on the branch card\/price-the-job/)
  assert.match(prompt, /Read the role note Coder/)
  assert.match(prompt, /already claimed for you/)
  assert.ok(prompt.endsWith('## Objective\n\nPrice it.\n'))
  assert.doesNotMatch(workerPrompt({
    card: 'wi-a1', title: 'Price the job', agent: 'a', vault: '/v', worktree: '/w', branch: 'card/x', body: 'B',
  }), /role note/)
})
