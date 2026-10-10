---
status: accepted
supersedes: 0058-delegate-a-card.md
amends: 0061-holder-names-who-does-the-work.md (holder is one name or a list), 0052-ready-cards-for-dispatch.md (any holder but agent is taken), 0066-count-only-working-agents.md (each agent on a card counts)
---
# Assign a card, and let a card have several holders

Victor decided on 2026-10-10 that `delegate` is renamed `assign`, and that a card can have several
holders. His own workflow keeps one holder, but the plugin allows several, so a person and an agent
can hold one card at once. This supersedes [0058](0058-delegate-a-card.md) and amends
[0061](0061-holder-names-who-does-the-work.md).

## `holder` is one name or a list

`holder` holds one name, `holder: Ana`, or a YAML list of names. YAML allows both, so every old card
stays valid. `wi` writes a plain value for one name, so a card with one holder reads as it always
did, and a list only for several. Every reader takes either form through one rule in
`src/shared/holder.ts`: a plain value is one name and is never split, a blank name is none, and a
name appears once, matched without case. An old card's `agent` key is still read as its holder,
and every write that changes the holders removes `agent` in the same write, as 0061 says.

## Assign adds a name, and writes nothing else

`wi assign <ref> --to <person|agent>` adds one name to the holders. The status stays, and no note is
written: communication belongs in the card, written on purpose, or in another channel. `--to`
takes a person note or `agent`, as `wi delegate` did, so a typo or a harness name cannot pass for an
agent. An agent joins a card by its own name when it claims it. `--off` removes a name, needs no
person note, and leaves the status. The card menu has **Assign to…**, which offers the people and
`agent` that do not hold the card yet, and **Unassign <name>** for each holder. Both call the
same shared step as `wi assign`.

`wi delegate` retires. It exits 0, writes nothing and names `wi assign`, like the other retired
commands.

## Claim starts a card that asks for the claimant

`wi claim` starts a card that has no holder, that holds `agent`, or that lists the claimant. The
claimant's name replaces `agent`, and the other holders stay. Any other card is refused: a second
agent must be assigned first. A person who wants an agent on their card assigns `agent` and starts
the agent with the card id. This keeps the guard against two workers that find one card in
`wi ready` and both take it.

## Release removes one holder

`wi release` removes one holder: `--holder`, else the caller in `WI_AGENT` when it holds the card,
else the only holder. With several holders and no name to choose by, it refuses. While another
named holder remains, the status stays: someone still works the card. When none remains, the card
moves to options as before, and a remaining `agent` stays as a request. A worker that releases a
stalled child's card still needs no flag, because that card has one holder.

## Who counts, and what is ready

- `wi agents` counts each agent on a doing card, so one card can use several places of
  `maxAgents`. A person and `agent` add none, and a card that waits adds none.
- `wi ready` treats a card with any holder but `agent` as taken. A card whose only holder is
  `agent` is a request, listed first.
- A doing child inherits its parent's holders, without `agent`.

## The JSON gives a list

`wi show --json` and `wi ready --json` give `holder` as a list of names, empty for none. `wi claim`,
`wi release` and `wi assign` with `--json` give `name`, the holder they added or removed, and
`holder`, the list after the write. This breaks a reader that expects a string, which is why it
ships in 1.0.0 and not later: a later release would break the shape that 1.0.0 published.

## The card face

A card shows the first holder's initial, then `+N` for the others. The hover, the detail strip and
the card menu give every name.

## Rejected

- Several people but at most one agent: half the work, and a rule nobody guesses.
- One holder in 1.0.0 and several in 1.1: 1.1 would break the JSON shape that 1.0.0 published.
- Assign by any name, with no person note: it would let a typo become an agent in `wi agents`.
