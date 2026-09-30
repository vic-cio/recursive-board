---
status: accepted
---
# Work items use stable IDs and parent wikilinks

Each work item is a Markdown file with a stable, unique ID. Its `parent` field is a wikilink resolved by filename stem; that link defines hierarchy and supports Obsidian backlinks. The ID provides stable, unambiguous lookup even when a filename changes. Titles may repeat, so filename stems are made unique when needed.

A root is a work item with no `parent` field and no status. The validator reports duplicate IDs, malformed or unresolved parent links, and hierarchy cycles rather than repairing them.

CLI lookup refuses an ID, filename stem, or title that matches more than one work item, and names every matching path. A folder-qualified link matches its vault-relative path exactly. An unqualified link resolves only when one work item has that filename stem. This prevents lookup from hiding duplicate IDs or selecting a same-named file in another folder.

## Considered options

Using filenames alone makes duplicate titles ambiguous. Storing parent IDs would weaken native Obsidian links. The model keeps both forms, with the parent wikilink authoritative for resolution.
