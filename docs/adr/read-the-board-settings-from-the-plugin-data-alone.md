---
status: accepted
amends: 0050-board-settings-in-plugin-data.md
---
# Read the board settings from the plugin data alone

The board settings have one source: the `board` key in `.obsidian/plugins/recursive-board/data.json`. `wi` and the plugin read no other file. Without a `board` key, both use the defaults. An invalid key is an error, never the defaults.

The readers of `Recursive Board config.md` and `.wi.json` are removed, and so is the plugin's migration from them. Every vault of the one user already keeps its settings in the plugin data. A file of either name that is left in a vault does nothing. `wi` prints no hint about it, and `wi validate` does not warn about it.

`findVaultRoot` stops at a folder that holds the plugin data file or `Boards/`. An old config file does not make a folder a vault.

## Considered options

Keeping the readers until the next minor release would keep three sources for one setting, and a migration that deletes a tracked file in the dev fixture. Nobody needs them now.
