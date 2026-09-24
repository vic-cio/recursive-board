---
status: accepted
---
# Stamp direct work-item edits in the active editor

When a changed work item is edited in Obsidian's active Markdown editor, the plugin sets `updated` to today. The plugin listens to `workspace`'s `editor-change` event rather than the vault's `modify` event: the latter also observes external writes such as sync. Obsidian documents `editor-change` as applying to user and programmatic editor changes, without an origin marker, so the listener is limited to the active Markdown editor and the plugin's own board writes remain on the vault API path. An unchanged document and an `updated` date already equal to today are left byte-for-byte alone, making the plugin's own stamp event idempotent. Board-action undo continues to restore the exact prior bytes, including the prior date, under the guarded rule in ADR 0019.
