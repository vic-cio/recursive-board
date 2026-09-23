---
status: accepted
---
# Vault configuration selects the work item folder

The work item folder belongs to the vault, not to plugin settings. Both the plugin and `wi` read `.wi.json` at the vault root. Its `workItemFolder` value is a vault-relative directory, and items sit directly inside it. The default is `Boards` when the key is absent. Invalid configuration fails instead of selecting another folder silently.

This lets existing vaults choose their own folder while keeping both writers in agreement. The plugin reloads the configuration when it changes.
