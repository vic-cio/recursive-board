---
status: accepted
---
# Reparent work items by changing only the child's parent link

The CLI and plugin both offer a move to a chosen work item. The plugin picker filters out targets that would create a parent cycle. A move changes only the moved item's parent link and update timestamp; its status and children stay with it. Roots cannot move, but an orphan can be repaired by choosing a valid parent.

Keeping the relationship on the child makes a move a one-file operation and avoids rewriting either parent's file. The shared transition rule prevents the CLI and plugin from accepting different moves.

## Considered options

Updating both the child and a parent would create extra writes and make concurrent moves on one board conflict in the same file. Moving an item between status groups remains a status change, not a reparent.
