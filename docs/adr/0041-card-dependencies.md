---
status: accepted
amended_by: 0072-the-dashboard-is-a-separate-example-plugin.md (the dashboard is a separate example plugin)
---
# A card can wait on other cards

`depends_on` is a list of wikilinks to the cards a card waits on:

```yaml
depends_on:
  - "[[Write the spec]]"
```

A dependency is open until its card is done. The wait is derived when the vault is read, so
nothing is written when a dependency closes, and the card that waits needs no edit to start. An
external wait becomes a card of its own, and the waiting card depends on it.

An archived card that is not done stays open. Archiving drops the work, and the card that needed
it must not start without a decision. `wi validate` warns (`depends-archived`), and the example dashboard
(ADR 0072) lists it under "Needs attention".

## Who enforces it

- `wi claim` and `wi status <ref> doing` refuse a card with an open dependency. The same agent
  that already holds the card in doing passes `wi claim`, as before.
- The board lets a person move a waiting card to doing. It shows a notice that names the open
  dependencies, and the example dashboard (ADR 0072) lists the card under "Needs attention" while it
  stays in doing.
  A person can judge that a dependency does not matter; an agent cannot.
- `wi status <ref> done` names each card that now waits on nothing open, so a dispatcher can start
  it.

## Who writes it

`wi depend <ref> --on <ref>` adds one entry, and `--off` removes it. The card menu's "Waits on…"
picker and its "Stop waiting on …" items make the same edit. Each writes one list on the card that
waits; the card it waits on is never touched (one file per operation). Both refuse a card that
waits on itself, on a root (never done), or on a card that already waits on it.

`wi validate` reports an entry that is not a wikilink, a link that does not resolve, a dependency
on a root, and a cycle, as errors.

## How it shows

A waiting card gets an hourglass badge whose label names the open dependencies. The meta strip says
"Waits on" with a link to each one, and a checklist row says "Waiting". `wi children` marks the card
`[waits on N]` and lists `waits_on` and
`depends_on` in its JSON.

## Why not more than this

A card still has one parent (0002). A dependency is the second kind of link between cards, and it
never changes where a card sits on a board.
