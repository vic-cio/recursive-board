---
status: accepted
---
# Sync handling stays provider neutral

The plugin and CLI read and write vault files through Obsidian and the local filesystem. They do not call a sync provider or depend on provider-specific APIs. When an unread hidden file appears in the configured work item folder, the CLI applies its general unaccounted-file rule.

This keeps vault behavior the same across local storage and different sync services. Provider-specific recovery steps belong in the user's own environment instructions.
