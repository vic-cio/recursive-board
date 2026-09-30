---
status: accepted
supersedes: vault config file locations in ADRs 0003, 0012, 0024, 0027, 0034, 0035, and 0039
superseded_by: 0050-board-settings-in-plugin-data.md
---

> Superseded by [0050](0050-board-settings-in-plugin-data.md): the board settings now live in the plugin data. The plugin still reads this note once, to migrate it.
# Store vault config in a synced Markdown note

Store vault settings in one marked JSON fence in `Recursive Board config.md` at the vault root. The note is visible, and sync clients can carry it with other Markdown notes. Keep the setting names and validation rules shared by the plugin and CLI.

When the note exists, read it alone. When it is absent, read `.wi.json` as a legacy fallback. Report an invalid note as an error. Do not fall back to `.wi.json` when the note exists. Keep config reads free from migration writes.

The loader keeps the selected file name for configuration diagnostics.
A validation warning names `Recursive Board config.md` when the note supplies the settings, or `.wi.json` for the legacy fallback.

Writers replace the JSON content and keep other note text. They keep unknown JSON keys. First-board setup and the plugin settings tab write the new note. Migration previews the proposed note first, then requires `wi config migrate --apply`. Migration refuses an existing note and leaves `.wi.json` intact.

Reload plugin settings when the note changes, appears, disappears, or changes its path. Both files stay provider neutral. Obsidian Sync excludes dotfiles. Sync can also restrict additional file types, so check the `Sync all other types` setting. See [Obsidian Sync settings](https://obsidian.md/help/sync/settings).

The note keeps the existing config model. It changes only the storage format so Sync can carry the settings to other devices.
