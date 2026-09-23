---
status: accepted
---
# Work items stay flat in a configurable folder

All work items sit directly in one work-item folder. Parent wikilinks carry hierarchy, so moving an item between boards does not move its file. The folder defaults to `Boards/` and can be changed in the vault-root `.wi.json` file with `workItemFolder`; both the CLI and plugin read the same setting. Invalid configuration fails instead of selecting another folder silently, and the plugin reloads the configuration when it changes. `defaultRoot` can name the parent used when creating a new item without an explicit parent.

The validator reports Markdown files nested below product folders. This keeps filesystem placement separate from work-item relationships while allowing an existing vault to choose its folder name.

## Considered options

Nested folders would make reparenting a file move and encode only tree-shaped relationships in paths. A fixed folder or separate CLI and plugin settings could force relocation or let the two writers disagree.
