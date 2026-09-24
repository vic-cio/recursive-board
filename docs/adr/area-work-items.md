---
status: accepted
---
# Mark ongoing areas with `area: true`

An area is an ongoing space for work with no definition of done. It is a work item with
`type: work-item`, its own ID, title, dates and parent wikilink, and `area: true`. It has no
`status`; adding one is invalid. A normal work item has a status and no area marker. Areas are
listed separately from status groups, and cannot be claimed by an agent.

`wi new --template area` creates an area. The template name selects the body and the area schema
together, so the two writers use the same renderer. The marker is a field rather than a template
name in stored Markdown because the file must retain its meaning after it is moved or edited.

The plugin presents areas as a separate group above status columns. Their rendering and the `wi`
conversion command are not part of this change.

## Considered options

A special `type: area` would split areas from the work item identity and parent graph, while a
template name is not stored in generated files. The marker keeps areas in the existing hierarchy
and makes the distinction explicit in canonical frontmatter.
