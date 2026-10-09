/**
 * The commands that run through runCommand on any storage port. wi runs these from here and
 * keeps its own switch for the rest; the plugin's CLI handler serves the same table.
 */
import type { RunFunction } from './command.ts'
import { runStatus } from './status.ts'

export const RUNNERS: Readonly<Record<string, RunFunction>> = {
  status: runStatus,
}
