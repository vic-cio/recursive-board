---
status: accepted
amends: docs/adr/0014-agent-claims.md (the field name), docs/adr/0038-nested-claims.md (the field name), docs/adr/0052-ready-cards-for-dispatch.md (requests first), docs/adr/0058-delegate-a-card.md (the field name and what delegating writes)
---
# The holder field names who does a card's work

A card's `holder` names the person or the agent who does its work now: `holder: Victor`, or an
agent's worker name such as `holder: claude-opus-5-5-price-the-job`. Every writer writes `holder`:
`wi claim`, `wi release`, `wi delegate`, `wi new --agent`, the board's add row, and the plugin. The
field was `agent`. That name reads wrong for a person, and a person and an agent act on cards the
same way. `assignee` was rejected: it says someone else gave the work, and an agent claims a card
itself.

## Old cards keep working

An old card's `agent` is read as its holder, so the vault needs no bulk edit. A card with both keys
uses `holder`. Every write that sets or clears the holder also removes `agent` in the same write,
so a card moves to the new key the first time its holder changes. One rule in
`src/shared/holder.ts` does both, and every reader calls it: the CLI, the plugin, the dashboard,
`wi ready`, `wi show` and `wi dashboard`. `agent` stays in the schema as a known field.

The flags keep their names. `wi claim --agent <name>` and `wi new --agent <name>` take the name of
the agent (or person) that holds the card, so no script breaks. JSON output names the field
`holder`: `wi claim`, `wi release`, `wi show`, `wi ready`, `wi delegate` and the dashboard Agents panel.
`wi agents` exits successfully and names `wi dashboard --panel agents`.

## `holder: agent` asks for any agent

The holder value `agent` is reserved. It means that any agent may take the card. It is not a name,
so it is not counted as an active agent and it appears as a request in the dashboard Agents panel;
the plugin shows it as "Any agent". `wi ready` lists these requests first, ahead of the priority order, while they sit in
options. A claim by any agent replaces `agent` with the claimant's name, so the request ends at the
first claim. `wi claim --agent agent` is refused, and `wi delegate` refuses a person note called
`agent`. A doing child does not inherit `holder: agent` from its parent: the request is for the
parent card.

A note line such as "Delegated to an agent." was rejected: state would live in note text. No
marker at all was rejected: it cannot tell Victor's own options from work he handed off.
