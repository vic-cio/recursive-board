---
status: accepted
amends: docs/adr/0015-checklist-and-board-navigation.md (when an item becomes a board)
---
# Promote a parent on its first child

When `wi new` gives a card its first child, it also writes `board: true` to that card. The vault
setting `autoPromote` in `.wi.json` turns this off; it defaults to `true`.

Agents that split a card into steps did not run `wi promote`, so the owner saw a checklist where
they expected a board. Promotion at the moment of the split needs no agent to remember it.

The rule is narrow so that it never undoes a person's choice. It promotes only on the first child.
A card that already has children and no `board` key is a checklist that someone chose or demoted.
It leaves roots, areas, and any card that has a `board` key alone. The plugin's add row does not
promote: a person who adds to a checklist chose a checklist.

## Consequences

This is a second file write in one command, against the rule that an operation writes one file.
The write is one key, set only when absent, after the child exists. If it fails, the child is
still valid and `wi promote` repairs the parent. A sync conflict on the parent can only disagree
about `board: true`, which both sides want.
