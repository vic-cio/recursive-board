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

## Known gap

A parent that works on its own while every child runs is not counted. The rule reads the board,
and the board cannot tell that apart from waiting.
