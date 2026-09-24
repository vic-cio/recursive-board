---
status: accepted
---
# Mark ongoing areas with `area: true`

An area is an ongoing space for work with no definition of done. It is a work item with
`type: work-item`, its own ID, title, dates, parent wikilink, status, and `area: true`. A normal
work item has a status and no area marker. Areas appear in their status group and in an area bar
while their status is not `done`. Areas cannot be claimed by an agent.

`wi new --template area` creates an area. The template name selects the body and the area schema
together, so the two writers use the same renderer. The marker is a field rather than a template
name in stored Markdown because the file must retain its meaning after it is moved or edited.

The plugin also presents open areas in a separate area bar above the status columns. A done area
stays in the Done column and leaves that bar. Its bar count is the number of its own non-archived
Doing cards.

## Considered options

A special `type: area` would split areas from the work item identity and parent graph, while a
template name is not stored in generated files. The marker keeps areas in the existing hierarchy
and makes the distinction explicit in canonical frontmatter.
