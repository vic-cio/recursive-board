---
status: accepted
amends: docs/adr/0034-agent-limit.md (the count), docs/adr/0038-nested-claims.md (the count), docs/adr/0040-dashboard-view.md (the Agents panel)
amended_by: 0072-the-dashboard-is-a-separate-example-plugin.md (the rule lives in src/shared/agents.ts)
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
  second wait model that the dashboard must parse and clear. Victor rejected the note on
  2026-10-04.

## Amendment 2026-10-04: a claim that waits for a verdict

A doing card whose newest `**Review:**` note follows its last verdict does not make its holder
active either. Its agent has finished and waits for the reviewer. Before this, cards sent for review
kept their holders in the count, and concierge read 9 of 8 with 5 agents working. Only the caller
has the card's text, so `activeAgentNames` takes an `awaitsReview` predicate: the CLI reads the
text it has loaded, and the plugin reads each claimed doing card with `cachedRead`.

## Amendment 2026-10-10: a wait on a person

[0082](0082-review-is-a-wait-on-a-person.md) replaces the `**Review:**` note rule. A doing card
that waits on a person, with a link to a person note in `depends_on`, does not make its holder
active. `activeAgents` still takes a predicate (`waitsOnPerson`), and the caller reads the card's
`depends_on` instead of its Notes.

## Known gap

A parent that works on its own while every child runs is not counted. The rule reads the board,
and the board cannot tell that apart from waiting.

## Amendment 2026-10-05: the rule moved

The rule lives in `src/shared/agents.ts` (`waitsOnChildren`, `activeAgents`), and `wi agents`
reports it ([0072](0072-the-dashboard-is-a-separate-example-plugin.md)). `wi claim` warns from the
same rule. The dashboard rows that marked a waiting claim moved to the example dashboard plugin,
which keeps its own copy of the rule.
