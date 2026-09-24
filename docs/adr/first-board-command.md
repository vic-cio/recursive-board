---
status: accepted
---
# Create the first board from Obsidian

When an enabled plugin finds no work items, it offers a dismissible first-board notice. The same command is available in the command palette in every vault. The command asks for a name, creates a root board and a starter child using shared renderers, sets that root as `.wi.json`'s `defaultRoot`, and opens it.

The notice dismissal lives in the plugin's vault-scoped data. It is not written into a work item or the vault's settings. Existing settings are kept when `defaultRoot` is selected. A root with the requested filename stem is never replaced.

## Considered options

Manual YAML remains available for people who want to create a board by hand. The guided command avoids requiring new users to know the schema, while the shared renderers keep the generated files valid for both `wi` and the plugin.
