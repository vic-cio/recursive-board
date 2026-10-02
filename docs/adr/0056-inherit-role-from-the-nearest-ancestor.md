---
status: superseded
superseded_by: docs/adr/0062-role-tags.md
---
# A card reads its role from the tree

A board often holds work of one kind. Set `role: Coder` on that board. Cards under it use that role
unless they set their own role.

The shared resolver reads a card's own `role`, then the nearest ancestor's role. It does not write
the inherited value. `wi show`, `wi delegate` and the card strip use this resolver. They mark a
role as inherited when it comes from an ancestor.

- `wi new --role <name>` sets the new card's own role.
- An empty `--role ""` removes the card's own role. The card then reads the nearest ancestor's role, if one exists.
- An area has no role unless someone sets one. A child reads the nearest role above it.
- A move can change a card's effective role. No card metadata changes during that resolution.

`role` keeps one meaning (0042): the procedure for this card's work. An ancestor's role is inherited
at read time.

## Rejected

- **A new field for the children's default role, such as `worker_role`.** A second field that
  only separates a board's role from its children's role. With one meaning for `role`, it adds nothing.
- **Copy the role at creation.** The tree already holds the role, and copies become stale after a
  move or role change.
- **No default.** The delegating agent passes `--role` for each card. A wrong guess skips the tests or the review.
