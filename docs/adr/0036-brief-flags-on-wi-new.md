---
status: accepted
---
# Write the brief with `wi new`

`wi new` takes `--objective` once, `--context` once per paragraph, and `--criteria` once per
criterion. It writes them into the template's sections in place of the starter lines. A flag for a
section the template does not have is refused before a file exists.

Agents made cards with `wi new` and left the body for a later file edit, which they skipped. One
command now makes a complete card.

`wi new` warns on stderr when the template has an Objective or Acceptance Criteria section and the
brief leaves it empty. `--strict` refuses the card instead. The warning is the default because a
person capturing an idea may have no brief yet.

`wi new` also says when a title's plain filename is taken and the file carries the id suffix, so
an agent with a generic title learns of the clash at once.
