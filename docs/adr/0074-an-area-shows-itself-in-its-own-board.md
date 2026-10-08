---
status: accepted
---
# An area shows itself as a card in its own board

The board of an area shows the area once more, as a self-card in the column of the area's own
status. The plugin draws it at the end of that column, after the real cards. It is a
reflection that suits the name Recursive Board, and it says which area you are in.
It is drawn like any card in that column, with its status tint and edge. A small This board
mark is the only sign that it is the board you are on (Victor, 2026-10-08: a dashed outline
looked unlike a card).

The self-card is render only. Nothing is written to Markdown, so `wi`, agents and `wi validate`
never see it, and parents stay acyclic. It adds nothing to a column count or a phone tab count.
It has no menu and no remove button, and it cannot be dragged, so no action on it writes. It
shows on desktop and on the phone, and it obeys the archive toggle like any card.

A click expands its preview in place like any card ([0016](0016-cards-expand-in-place.md)). The
title of the expanded self-card opens the area, which is the board you are on. That open plays a
short zoom: the board grows out of the card's place to its full size. A modifier-click opens the
board in a new tab, with no zoom. A reduced-motion setting turns the zoom off.

Only an area shows a self-card. A promoted card and a root do not.

## Considered options

A real self-parent link would make the self-card visible to every writer and break the acyclic
parent rule. A faint self-chip above the columns would take a whole row, because the area chips
live on the root board only, so nothing else shares that row on an inner board.
