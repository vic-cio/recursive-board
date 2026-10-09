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
// The card edit commands (wi-0fko).
import { runArchive } from './archive.ts'
import { runArea } from './area.ts'
import { runClaim, runRelease } from './claim-release.ts'
import { runDelegate } from './delegate.ts'
import { runDepend } from './depend.ts'
import { runNote } from './note.ts'
import { runDemote, runPromote } from './promote.ts'
import { runApprove, runReview, runSendBack } from './review.ts'
import { runSet } from './set.ts'
import { runTag } from './tag.ts'
// new, move, rm and the retired commands (wi-5s2x).
import { runNew } from './new.ts'
import { runMove } from './move.ts'
import { runRemove } from './remove.ts'
import { RETIRED } from './retired.ts'

export const RUNNERS: Readonly<Record<string, RunFunction>> = {
  status: runStatus,
  // The read commands (wi-ipw8).
  agents: runAgents,
  children: runChildren,
  ready: runReady,
  show: runShow,
  validate: runValidate,
  // The card edit commands (wi-0fko).
  note: runNote,
  tag: runTag,
  area: runArea,
  depend: runDepend,
  set: runSet,
  claim: runClaim,
  release: runRelease,
  delegate: runDelegate,
  review: runReview,
  approve: runApprove,
  'send-back': runSendBack,
  archive: runArchive,
  promote: runPromote,
  demote: runDemote,
  // new, move, rm and the retired commands (wi-5s2x).
  new: runNew,
  move: runMove,
  rm: runRemove,
  ...RETIRED,
}
