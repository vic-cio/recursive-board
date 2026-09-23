---
status: accepted
---
# Removing work items moves them to trash

`wi rm` moves removed Markdown files into the vault's `.trash` folder instead of unlinking them. Removing an item with children requires `--recursive`, which moves its descendants too; a root cannot be removed. `--dry-run` shows the affected files without moving them.

`wi rm` and `wi move` refuse when a hidden non-Markdown file in the work-item folder has not been accounted for. The index may otherwise miss a work item and misread the hierarchy. There is no force option.

## Considered options

Permanent deletion is harder to recover from. Forbidding agent removal leaves no supported way to discard abandoned work and does not prevent direct filesystem deletion.
