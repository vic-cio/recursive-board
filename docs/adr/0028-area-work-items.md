---
status: accepted
amended_by: 0073-area-chips-live-on-the-root-board.md (the bar shows on a root board only, lists every live area below it, and the phone draws the same strip)
---
# Mark ongoing areas with `area: true`

An area is an ongoing space for work with no definition of done. It is a work item with
`type: work-item`, its own ID, title, dates, parent wikilink, status, and `area: true`. A normal
work item has a status and no area marker. Areas appear in their status group and in an area bar
while their status is not `done`. Areas cannot be claimed by an agent.

`wi new --template area` creates an area. The template name selects the body and the area schema
together, so the two writers use the same renderer. The marker is a field rather than a template
name in stored Markdown because the file must retain its meaning after it is moved or edited.

The plugin also presents live areas, those in options or doing, in a separate area bar above the
status columns. A backlog area is not live yet and a done area has retired, so each stays in its
column and leaves that bar. Its bar count is the number of its own non-archived
Doing cards.

## Considered options

A special `type: area` would split areas from the work item identity and parent graph, while a
template name is not stored in generated files. The marker keeps areas in the existing hierarchy
and makes the distinction explicit in canonical frontmatter.

## Amendment 2026-10-08: the bar moved to the root board

The area bar shows on a root board only. It lists every live area below the root, at any depth, in
tree order ([0073](0073-area-chips-live-on-the-root-board.md)). A board that is not a root shows
no bar, because a live area is also a card in its status column. The phone draws the same strip of
small chips, with no ⋯ button. The rules above for which areas are live, and for the count, stay.
