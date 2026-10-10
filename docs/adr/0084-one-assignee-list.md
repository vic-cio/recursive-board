---
status: accepted
supersedes: 0061-holder-names-who-does-the-work.md (the key name, and the rejection of `assignee`)
amends: 0083-assign-and-several-holders.md (the key is `assignee`, not `holder`), 0052-ready-cards-for-dispatch.md (the key is `assignee`), 0066-count-only-working-agents.md (the key is `assignee`)
---
# One assignee list, and no separate owner

Victor decided on 2026-10-10, while he reviewed the 1.0.0 build, that a card has one list of people
and agents assigned to it, and no separate `owner` field. The level in the tree gives the meaning,
and no role type does. This supersedes [0061](0061-holder-names-who-does-the-work.md) on the key
name, and it amends [0083](0083-assign-and-several-holders.md),
[0052](0052-ready-cards-for-dispatch.md) and [0066](0066-count-only-working-agents.md) where they
say `holder`.

## The key is `assignee`, one name or a list

The frontmatter key is `assignee`. It holds one name, `assignee: Ana`, or a YAML list for several,
`assignee: [Ana, codex-1]` or a block list. `wi` writes a plain value for one name, as it wrote
`holder` before. The reserved value `agent` still means that any agent may take the card.

## A reader falls back to the old keys

A reader takes `assignee`, else the old `holder`, else the old `agent`. A card with more than one
of these keys uses the first in that order. No card is rewritten to migrate it: every old card stays
valid, as 0061 kept the old `agent` key valid.

## A write that changes the assignees moves the card to the new key

A write that changes the assignees writes `assignee` and removes `holder` and `agent` from that card
in the same write, as 0061 did for `agent`. A write that does not change the assignees leaves every
key as it is. One shared rule does both, and every reader and writer calls it.

## JSON uses `assignees`

A JSON result uses the key `assignees`, an array of names, wherever it used `holder`. No `holder`
key remains in any JSON result. An empty list means none.

## The flag is `--assignee`, and `--holder` still works

`--assignee <name>` replaces `--holder <name>` on `wi new`, `wi claim` and `wi ready`. `--holder` is
still accepted and means the same. The commands keep their names: `claim`, `release` and `assign`.

## Where the tools print the word

Where the plugin or `wi` printed `holder`, `held by` or `holds`, it prints `assignee` or
`assigned to`. The hover of the assignee chip on a card face reads `Assigned to <names>`, and the
label of the assignee pill in the open card header reads `Assigned to <names>`. CSS class names do
not change.

## The `owner` key is dropped, as `creator` was

The `owner` key leaves the model, as `creator` left it in
[0064](0064-validate-checks-no-creator.md): no command writes it, no screen shows it, and no JSON
result carries it. An old card keeps its `owner` key, which every write preserves and nothing reads.
Reading `owner` as an assignee is wrong, because `wi ready` treats any assignee as taken, and 108
cards in the projects vault carry `owner`. `wi new --owner` and `wi set --owner` retire.

## The plugin is not prescriptive

The plugin makes no rule about who may assign whom or how a team assigns: no check, no permission,
no required level, and no title. A team may use the levels of the tree as it likes, for example the
assignee one level down as the owner. The plugin does not check that convention. Users and teams
arrange their own rules for managing assignments.

## Internal names follow the key

`src/shared/holder.ts` becomes `assignee.ts`, `holders` becomes `assignees`, and `holderBadge`
becomes `assigneeBadge`. Test files and `scripts/fixture.ts` follow. CSS class names stay.

## The rules version stays 1

The rules version stays 1. The 0.9.0 tag has no rules marker, and 1.0.0 ships it first, so the
rename breaks no recorded rules version.

## Why

Victor: "recursion works best when the mechanics are simple". One word, assignee, names everyone on
a card, and the tree already supplies who is accountable for what. A person who is both owner and
holder reads as a duplicate, and two words for one kind of person add a concept the tree already
supplies.

## Rejected

- **Keep owner and holder as two fields.** Victor rejected the agent's recommendation: two fields,
  two words, and a header that shows one person twice.
- **Keep the key `holder` and change only the words.** Victor decided the same day to rename the key
  to `assignee`, which reverses the choice in the earlier grill on agent fields and commands. That
  grill rejected `assignee` because an agent that claims a card has no one who assigned it. Victor accepted
  the cost: one word, assignee, now names everyone on a card, and `assign`, `claim` and `release`
  keep their names.
- **The plugin enforces who may assign.** Victor: the plugin is not prescriptive. Users and teams
  arrange their own rules for managing assignments. The plugin has no check, permission, required
  level or title.
- **Read `owner` as an assignee.** It would make `wi ready` treat 108 cards in the projects vault as
  taken.
