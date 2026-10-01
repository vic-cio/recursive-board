---
status: accepted
---
# A new card copies the role of its nearest ancestor

A board often holds work of one kind. Set `role: Coder` once on that board. Each new card under it then
gets `role: Coder` without a flag.

When a new card is given no role, the writer looks at the parent, then each ancestor up to the root.
It copies the `role` of the first one that has a role. With no role in the chain, the card gets no role.
Both writers apply the rule: `wi new` and the board's add row. The rule is `roleForNewCard` in
`src/shared/authorship.ts`.

- An explicit `wi new --role <name>` wins.
- An empty `--role ""` writes no role. It matches `wi set --role ""`, which removes a role.
- A new area copies no role, because an area does no work. A card under the area still looks past it.
- The writer copies the name into the new card. It writes no other file (one file per operation).
  A later change to the ancestor's role does not change the cards that exist. Use `wi set` on each card for that.

`role` keeps one meaning (0042): the role that must do this card's work. The board's own `role` is its own
role, and it is also the default for the cards made under it.

## Rejected

- **A new field for the children's default role, such as `worker_role`.** A second field that
  only separates a board's role from its children's role. With one meaning for `role`, it adds nothing.
- **A role computed at read time.** A card with no `role` would show the ancestor's role. A move
  would then change a card's role with no write to that card, and `wi validate` and Bases would see
  a different value than the strip.
- **No default.** The delegating agent passes `--role` for each card. A wrong guess skips the tests or the review.
