---
status: accepted
amends: docs/adr/0028-area-work-items.md (where the area bar shows, what it lists, and how the phone draws it)
---
# Area chips live on the root board

A root board shows the area bar, and no other board does. The bar holds one chip for every live
area anywhere below the root, at any depth. The phone shows the same strip as the desktop.

## The rule

- **A root lists every live area below it.** A live area has status `options` or `doing`. The
  walk goes through every child at any depth, whatever the status of the item that holds the
  area. A live area inside a done card or a backlog area still shows.
- **One flat row, in tree order, depth first.** An area's chip comes just before the chips of the
  areas inside it. Siblings keep the order of the board columns: priority, then update time, then
  name. A chip for an area that is not a direct child of the root has a hover title, `In <parent>`.
- **A board that is not a root shows no bar.** That includes an area that is itself a board, and an
  orphan whose parent link resolves to nothing. A chip on its own parent board repeats a card that
  the board already shows, because a live area also shows as a normal card in its status column. An
  area is a space where Victor spends time, so the chips belong on the front door.
- **The count is unchanged.** A chip counts its area's own non-archived Doing cards. An area inside
  it is not a card, and the cards inside that area are not counted.
- **The walk never loops.** Integrity rule 3 says the tree is acyclic, and a broken vault can still
  loop. The walk visits each item once.
- **The archived-items view still applies.** An archived area shows only while the board shows
  archived items.

`toAreas(root, childrenOf)` in `src/plugin/index.ts` holds the rule. It takes the board and a
`childrenOf` function, and returns `[]` for a board with a parent link.

## The phone

The phone draws the desktop strip: small chips in one row that scrolls sideways, above the status
tabs. It replaces the collapsible Areas group of full-width rows with a ⋯ button on each row.

A chip has no ⋯ button. iOS fires no `contextmenu` event on a long press, so the ⋯ button exists to
open the menu. An area's own card on its parent board already carries one. On the desktop, a right
click on a chip still opens the menu. A tap on a chip opens the area.

## Why

Victor decided this on 2026-10-08. A chip on an area's direct parent board is redundant, because an
inner board loses no information when its bar goes: the live area is also a card in its column. The
phone rows were far too big.

## Rejected

- **Show the bar on every board, with the areas below it.** Every board repeats the cards in its
  own columns, and the bar competes with the columns.
- **Show only the root's direct children.** An area in a project board would then have no chip
  anywhere, and the root is where the areas should be one tap away.
- **Group the chips by the board that holds them.** It needs a second row on each root, and a
  hover title already names the parent.
- **Keep the Areas group on the phone and only shrink the rows.** It keeps a second layout for
  one list, and the rows still hide the area names behind a tap.
