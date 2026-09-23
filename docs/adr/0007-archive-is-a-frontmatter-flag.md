---
status: accepted
---
# Archiving is a frontmatter flag inherited at read time

`archived: true` hides a work item while leaving its file and status in place. Descendants of an archived item are also hidden when the index reads the hierarchy. Archiving or unarchiving a subtree therefore changes only the selected item's file. An item's own archive flag continues to apply when an ancestor is unarchived. Archiving is refused while a descendant is in the `doing` status.

The archive flag is separate from status: status describes work progress, while archive controls visibility. The CLI and plugin use the shared archive rules.

## Considered options

Moving files to an archive folder changes paths and breaks the flat-folder model. A fifth status would mix progress with visibility and overwrite the item's existing status.
