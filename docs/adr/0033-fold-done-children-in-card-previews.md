---
status: accepted
amends: docs/adr/0016-cards-expand-in-place.md (the expanded checklist)
---
# Fold done children in an expanded card

An expanded card lists its open children (backlog, options, doing) and folds its done children
into one line, such as "34 done". The line opens the card, where the full checklist or the Done
column holds the history. The expansion is a preview of what is live, and a card with a long
history made it too long to read.

Open children are never capped. A long backlog on a card is a prompt to deal with it, so the
preview shows all of it.

Archived done children count only while the card shows archived items, the same rule as the rows.
The note's own checklist and the board are unchanged: done items there stay tickable.
