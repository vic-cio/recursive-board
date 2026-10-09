/**
 * The commands that run through runCommand on any storage port. wi runs these from here and
 * keeps its own switch for the rest; the plugin's CLI handler serves the same table.
 */
import type { RunFunction } from './command.ts'
import { runStatus } from './status.ts'
// The read commands (wi-ipw8).
import { runAgents } from './agents.ts'
import { runChildren } from './children.ts'
import { runReady } from './ready.ts'
import { runShow } from './show.ts'
import { runValidate } from './validate.ts'

export const RUNNERS: Readonly<Record<string, RunFunction>> = {
  status: runStatus,
  // The read commands (wi-ipw8).
  agents: runAgents,
  children: runChildren,
  ready: runReady,
  show: runShow,
  validate: runValidate,
}
