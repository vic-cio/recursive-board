---
status: accepted
---
# Archive work items with a frontmatter flag

Archiving sets `archived: true` on one work item and leaves its file in place. The index treats descendants of an archived item as archived too, so restoring the parent reveals the subtree without rewriting child files. The CLI and plugin share the archive rule. Archiving is refused if a descendant is doing.

## Considered options

Moving files into an archive folder would change paths and require a multi-file operation. A separate status would mix visibility with work progress and lose the previous status of completed items.
