---
status: accepted
supersedes: 0043-review-verdicts.md, 0065-review-verdicts-in-wi.md
amends: 0041-card-dependencies.md (a wait may name a person), 0066-count-only-working-agents.md (a wait on a person replaces the review note rule), 0058-delegate-a-card.md (review no longer changes owner)
---
# Review is a wait on a person

Victor decided on 2026-10-10 that a review is a wait on a person, kept in the same `depends_on`
field and set with the same commands as a wait on a card. There are no verdict commands and no
verdict notes. This supersedes [0043](0043-review-verdicts.md) and
[0065](0065-review-verdicts-in-wi.md).

## The decision

- **A person wait is a link in `depends_on`.** The link names a note with `type: person`, next to
  any card links: `depends_on: ["[[Write the launch post]]", "[[Ana]]"]`. `wi` tells the two apart
  by what the link resolves to. A work item wins over a person note of the same name.
- **`wi depend <ref> --on <ref|person> [--off]` sets and clears it.** **Waits on…** in the card
  menu lists people and cards. **Stop waiting on…** clears one. Neither writes a note.
- **Clearing a wait sends the card back.** The card stays in `doing` with its holder.
- **Moving a card to done clears its person waits.** That is the approval. The rule is in
  `statusEditsIn` in `src/shared/transitions.ts`, so a tick in Obsidian and `wi status <ref> done`
  do the same. A person who moves a card to done approves it, whether or not they meant to.
  Waits on cards stay.
- **A card with an open wait on a person cannot be started.** `wi claim` and
  `wi status <ref> doing` refuse it, as they refuse a card with an open card wait. A holder keeps
  its claim on a card that is already in `doing`. `wi ready` leaves such a card out.
- **`wi agents` skips the holder of a doing card that waits on a person.** The agent has finished
  and waits for the person. `awaitsReviewVerdict`, which read the note lines, is deleted.
- **`wi show --json` lists the people** in `personDependencies`, beside `dependencies`.
  `wi children --json` adds `waits_on_people`. `wi validate` accepts a link to a person note and
  still reports a link that resolves to nothing.
- **Retired:** `wi review`, `wi approve` and `wi send-back`. Each prints the command to use and
  exits 0, as the other retired commands do. **Send for review…** leaves the card menu. No command
  or menu item writes a `**Review:**`, `Approved by` or `Sent back by` note, and `owner` no longer
  changes in a review.

## Why

A review asks whether a person has looked at the card. A wait already says that a card cannot
start until something else happens. One wait for cards and people means one set of commands to
learn and one guard against starting a waiting card. The verdict commands did nothing a person
could not already do with `--off` and `status done`, and each had rules to keep (who may approve,
what to refuse). Communication belongs on the card, written on purpose, or in another channel.

The person wait lives in the frontmatter only while it applies. A removed wait leaves no trace in
the durable record.

## Consequences

- The ADRs 0043, 0044 and 0065 describe a flow that no longer exists. The dashboard, a separate
  plugin ([0072](0072-the-dashboard-is-a-separate-example-plugin.md)), must list the cards that
  wait on a person and stop writing verdict notes.
- A script that parsed a `**Review:**` note finds none. A script that ran `wi review` still exits 0
  and gets the new command in its output.
- `wi depend --on <name>` reads the vault's person notes, so it scans the vault once when the name
  is not a card. A vault load scans only when a card links to something that is not a work item.
- **Discovery.** With no **Send for review…**, a user must know that a review is a wait. The
  README, the skill and `wi --help` say so where a reader looks for "review".
