---
status: accepted
amends: docs/adr/0034-agent-limit.md (the count), docs/adr/0038-nested-claims.md (the count), docs/adr/0040-dashboard-view.md (the Agents panel)
---
# Count only working agents

An agent counts against `maxAgents` when it works a doing card. A doing card whose open children
are all in doing does no work of its own: its agent only waits on them. That card does not make
its agent active. An open child is a child that is not done and not archived. A card with no open
child, or with an open child in backlog or options, still counts.

The rule lives in `src/shared/dashboard.ts` (`waitsOnChildren`, `activeAgentNames`). The dashboard
Agents panel, `wi dashboard --panel agents` and the limit warning in `wi claim` all apply it.

- An agent still counts once through any other doing card that it works. An agent that holds a
  card and its current subtask (0038) counts through the subtask.
- `wi claim` counts after the claim. A claim can move the last open step to doing, so the parent's
  agent stops counting in the same write. The warning fires only when the claim makes the agent
  active and the count then passes the limit. Its text is "N agents now work a doing card".

## How it shows

The Agents feed keeps the row of a waiting claim, so a person sees every claim. The row gets an
hourglass and "waits on its steps" in place of the working spinner. The working badge on a
Progress row skips it, as the active count does. `wi dashboard --json` gives each claim
`waiting: true|false`, and the text output ends a waiting claim's line with "waits on its steps".

The wait is read from the board: the steps' status. Nothing is written, so the mark clears when a
step leaves doing or closes.

## Why

The limit is vault-wide (0034), and an agent may split its card and give the children to workers.
A parent that waits on its children took a slot that it did not use. A tree of agents at the limit
could then deadlock: each parent waits on a child that no slot is free to start. Victor chose this
rule on 2026-10-01 in the grill on agent files for session dispatch (design A6).

`wi claim` had its own copy of the count in `src/cli/wi.ts`. It now reads the shared rule, so the
warning and the panel cannot disagree.

## Rejected

- **A per-depth limit or a depth cap.** A second number to tune (design A6, q7 and q10).
- **Count the parent while any child is in doing.** The parent may still work a child in options.
- **A `**Waiting:**` note that an agent writes at the limit, listed as a warning (design A6).**
  Not built. A card that waits on another card already says so with `depends_on` (0041), and a
  parent that waits on its steps is read from the board, as above. After 0063, wi starts no agent,
  and the agent that starts workers reads the count before each start. A prose note would be a
  second wait model that the dashboard must parse and clear. This is a question for Victor on the
  card wi-cavr.

## Known gap

A parent that works on its own while every child runs is not counted. The rule reads the board,
and the board cannot tell that apart from waiting.
