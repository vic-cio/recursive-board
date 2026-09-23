---
status: accepted
---
# Work items use stable IDs and parent wikilinks

Each work item is a Markdown file with a stable, unique ID. Its `parent` field is a wikilink resolved by filename stem; that link defines hierarchy and supports Obsidian backlinks. The ID provides stable, unambiguous lookup even when a filename changes. Titles may repeat, so filename stems are made unique when needed.

A root is a work item with no `parent` field and no status. The validator reports duplicate IDs, malformed or unresolved parent links, and hierarchy cycles rather than repairing them.

## Considered options

Using filenames alone makes duplicate titles ambiguous. Storing parent IDs would weaken native Obsidian links. The model keeps both forms, with the parent wikilink authoritative for resolution.
